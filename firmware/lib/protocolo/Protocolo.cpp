#include "Protocolo.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

namespace ps {

const char* const CODIGOS_PONTOS[MAX_PONTOS] = {"A", "B", "C"};

// ---------------------------------------------------------------- hora

// Dias desde 1970-01-01 a partir de ano/mês/dia (algoritmo de H. Hinnant, calendário gregoriano)
static int64_t diasDesdeEpoca(int64_t a, unsigned m, unsigned d) {
  a -= m <= 2;
  const int64_t era = (a >= 0 ? a : a - 399) / 400;
  const unsigned yoe = (unsigned)(a - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int64_t)doe - 719468;
}

static void dataCivil(int64_t z, int64_t* a, unsigned* m, unsigned* d) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = (unsigned)(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  *d = doy - (153 * mp + 2) / 5 + 1;
  *m = mp < 10 ? mp + 3 : mp - 9;
  *a = (int64_t)yoe + era * 400 + (*m <= 2);
}

int formatarIso(uint64_t epochUs, char* buf, size_t tamanho) {
  uint64_t segundos = epochUs / 1000000ULL;
  unsigned micros = (unsigned)(epochUs % 1000000ULL);
  int64_t dias = (int64_t)(segundos / 86400ULL);
  unsigned noDia = (unsigned)(segundos % 86400ULL);
  int64_t a;
  unsigned m, d;
  dataCivil(dias, &a, &m, &d);
  return snprintf(buf, tamanho, "%04d-%02u-%02uT%02u:%02u:%02u.%06uZ", (int)a, m, d, noDia / 3600,
                  (noDia / 60) % 60, noDia % 60, micros);
}

static bool numero(const char*& p, int digitos, int* valor) {
  int v = 0;
  for (int i = 0; i < digitos; i++) {
    if (!isdigit((unsigned char)p[i])) return false;
    v = v * 10 + (p[i] - '0');
  }
  p += digitos;
  *valor = v;
  return true;
}

bool lerIso(const char* texto, uint64_t* epochUs) {
  if (!texto) return false;
  const char* p = texto;
  int a, m, d, h, mi, s;
  if (!numero(p, 4, &a) || *p++ != '-' || !numero(p, 2, &m) || *p++ != '-' || !numero(p, 2, &d)) return false;
  if (*p != 'T' && *p != 't' && *p != ' ') return false;
  p++;
  if (!numero(p, 2, &h) || *p++ != ':' || !numero(p, 2, &mi) || *p++ != ':' || !numero(p, 2, &s)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return false;

  uint32_t micros = 0;
  if (*p == '.') {
    p++;
    int casas = 0;
    while (isdigit((unsigned char)*p)) {
      if (casas < 6) micros = micros * 10 + (uint32_t)(*p - '0');
      casas++;
      p++;
    }
    if (casas == 0) return false;
    for (; casas < 6; casas++) micros *= 10;
  }

  int64_t deslocamentoS = 0;
  if (*p == 'Z' || *p == 'z') {
    p++;
  } else if (*p == '+' || *p == '-') {
    int sinal = *p == '-' ? -1 : 1;
    p++;
    int fh, fm;
    if (!numero(p, 2, &fh) || *p++ != ':' || !numero(p, 2, &fm)) return false;
    deslocamentoS = sinal * (fh * 3600 + fm * 60);
  } else {
    return false;
  }
  if (*p != '\0' && *p != '"') return false;

  int64_t segundos = diasDesdeEpoca(a, (unsigned)m, (unsigned)d) * 86400 + h * 3600 + mi * 60 + s - deslocamentoS;
  if (segundos < 0) return false;
  *epochUs = (uint64_t)segundos * 1000000ULL + micros;
  return true;
}

// ---------------------------------------------------------------- janela

// Número no JSON: NaN e infinito não são JSON válido; viram 0
static float finito(float v) {
  return isfinite(v) ? v : 0.0f;
}

size_t montarJson(const DadosJanela& j, const char* dispositivo, char* buf, size_t tamanho) {
  char instante[32];
  formatarIso(j.inicioUs, instante, sizeof(instante));
  size_t usado = 0;
  int n = snprintf(buf, tamanho,
                   "{\"dispositivo\":\"%s\",\"medido_em\":\"%s\",\"rotacao_rpm\":%.1f,\"saturou\":%s,"
                   "\"modo\":\"%s\",\"amostras\":%u,\"amostras_esperadas\":%u,\"pontos\":{",
                   dispositivo, instante, (double)finito(j.rotacaoRpm), j.saturou ? "true" : "false",
                   j.modoRapido ? "rapido" : "normal", (unsigned)j.amostras, (unsigned)j.amostrasEsperadas);
  if (n < 0 || (size_t)n >= tamanho) return 0;
  usado = (size_t)n;
  bool primeiro = true;
  for (int i = 0; i < MAX_PONTOS; i++) {
    const MedidaPonto& p = j.pontos[i];
    if (!p.presente) continue;
    n = snprintf(buf + usado, tamanho - usado,
                 "%s\"%s\":{\"rms_g\":%.5f,\"pico_g\":%.5f,\"curtose\":%.4f,\"o1x\":%.5f,\"o2x\":%.5f,\"o3x\":%.5f}",
                 primeiro ? "" : ",", CODIGOS_PONTOS[i], (double)finito(p.rmsG), (double)finito(p.picoG),
                 (double)finito(p.curtose), (double)finito(p.o1x), (double)finito(p.o2x), (double)finito(p.o3x));
    if (n < 0 || usado + (size_t)n >= tamanho) return 0;
    usado += (size_t)n;
    primeiro = false;
  }
  n = snprintf(buf + usado, tamanho - usado, "}}");
  if (n < 0 || usado + (size_t)n >= tamanho) return 0;
  return usado + (size_t)n;
}

bool lerModoRapidoAte(const char* json, uint64_t* epochUs) {
  if (!json) return false;
  const char* chave = strstr(json, "\"modo_rapido_ate\"");
  if (!chave) return false;
  const char* p = chave + strlen("\"modo_rapido_ate\"");
  while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
  if (*p++ != ':') return false;
  while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
  if (*p++ != '"') return false;  // null ou outro tipo: sem modo rápido
  char valor[40];
  size_t i = 0;
  while (*p && *p != '"' && i < sizeof(valor) - 1) valor[i++] = *p++;
  if (*p != '"') return false;
  valor[i] = '\0';
  return lerIso(valor, epochUs);
}

// ---------------------------------------------------------------- envio

Decisao decidir(int codigoHttp) {
  if (codigoHttp >= 200 && codigoHttp < 300) return Decisao::SUCESSO;
  if (codigoHttp == 401) return Decisao::CHAVE_INVALIDA;
  if (codigoHttp == 400 || codigoHttp == 403 || codigoHttp == 413 || codigoHttp == 422) return Decisao::DESCARTAR;
  return Decisao::REENVIAR;
}

uint32_t esperaReenvioMs(uint32_t falhas) {
  if (falhas == 0) return 0;
  if (falhas >= 7) return 60000;
  return 1000u << (falhas - 1);  // 1, 2, 4, 8, 16, 32 s
}

// ---------------------------------------------------------------- sinal bruto

uint16_t crc16(const uint8_t* dados, size_t n, uint16_t crc) {
  for (size_t i = 0; i < n; i++) {
    crc ^= (uint16_t)dados[i] << 8;
    for (int b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
    }
  }
  return crc;
}

static void poe16(uint8_t* p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)(v >> 8);
}

size_t montarQuadro(uint8_t seq, uint32_t tUs, uint8_t ir, const uint8_t n[3], const int16_t* const amostras[3],
                    uint8_t* buf, size_t tamanho) {
  size_t total = QUADRO_CABECALHO + 2;
  for (int s = 0; s < 3; s++) {
    if (n[s] > QUADRO_MAX_POR_SENSOR) return 0;
    total += (size_t)n[s] * 6;
  }
  if (total > tamanho) return 0;
  size_t i = 0;
  buf[i++] = QUADRO_SINC_1;
  buf[i++] = QUADRO_SINC_2;
  buf[i++] = QUADRO_TIPO_AMOSTRAS;
  buf[i++] = seq;
  buf[i++] = (uint8_t)(tUs & 0xFF);
  buf[i++] = (uint8_t)((tUs >> 8) & 0xFF);
  buf[i++] = (uint8_t)((tUs >> 16) & 0xFF);
  buf[i++] = (uint8_t)((tUs >> 24) & 0xFF);
  buf[i++] = ir;
  for (int s = 0; s < 3; s++) buf[i++] = n[s];
  for (int s = 0; s < 3; s++) {
    for (int k = 0; k < n[s] * 3; k++) {
      poe16(buf + i, (uint16_t)amostras[s][k]);
      i += 2;
    }
  }
  poe16(buf + i, crc16(buf + 2, i - 2));
  i += 2;
  return i;
}

}  // namespace ps
