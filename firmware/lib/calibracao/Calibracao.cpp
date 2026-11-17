#include "Calibracao.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Protocolo.h"

namespace ps {

static const char CODIGOS[3] = {'A', 'B', 'C'};

// ---------------------------------------------------------------- média e desvio

void MediaDesvio::zerar() {
  n_ = 0;
  media_ = 0.0;
  m2_ = 0.0;
}

void MediaDesvio::amostra(double valor) {
  n_++;
  double delta = valor - media_;
  media_ += delta / (double)n_;
  m2_ += delta * (valor - media_);
}

double MediaDesvio::desvio() const {
  return n_ ? sqrt(m2_ / (double)n_) : 0.0;
}

// ---------------------------------------------------------------- conta e checagens

const char* explicar(ResultadoCal r) {
  switch (r) {
    case ResultadoCal::OK: return "ok";
    case ResultadoCal::POUCAS_AMOSTRAS: return "poucas amostras na medida (sensor parou de entregar?)";
    case ResultadoCal::DESVIO_ALTO: return "desvio alto: o sensor estava mexendo; apoie e repita sem tocar";
    case ResultadoCal::FORA_DA_FAIXA: return "leitura fora da faixa de 1 g parado; confira a posição e o sensor";
    case ResultadoCal::FALTA_CIMA: return "falta a posição de cima (cal X cima)";
    case ResultadoCal::FALTA_BAIXO: return "falta a posição de baixo (cal X baixo)";
    case ResultadoCal::GANHO_IMPLAUSIVEL:
      return "ganho fora de 200 a 320 LSB/g: posições trocadas ou sensor de lado; repita as duas";
  }
  return "?";
}

ResultadoCal avaliarLeitura(const MediaDesvio& m) {
  if (m.n() < CAL_AMOSTRAS_MIN) return ResultadoCal::POUCAS_AMOSTRAS;
  if (m.desvio() > CAL_DESVIO_MAX_LSB) return ResultadoCal::DESVIO_ALTO;
  if (fabs(m.media()) > CAL_LEITURA_MAX_LSB) return ResultadoCal::FORA_DA_FAIXA;
  return ResultadoCal::OK;
}

ResultadoCal calcularCalibracao(double cima, double baixo, double* ganho, double* offset) {
  double g = (cima - baixo) / 2.0;
  if (!(g >= CAL_GANHO_MIN && g <= CAL_GANHO_MAX)) return ResultadoCal::GANHO_IMPLAUSIVEL;
  *ganho = g;
  *offset = (cima + baixo) / 2.0;
  return ResultadoCal::OK;
}

float escalaG(const CalibracaoPonto& c, float nominal) {
  if (!c.calibrado || !(c.ganhoLsbPorG >= CAL_GANHO_MIN && c.ganhoLsbPorG <= CAL_GANHO_MAX)) return nominal;
  return 1.0f / c.ganhoLsbPorG;
}

size_t formatarIdCalibracao(int ponto, uint32_t carimbo, char* buf, size_t tamanho) {
  int n;
  if (carimbo == 0 || ponto < 0 || ponto > 2) {
    n = snprintf(buf, tamanho, "nominal");
  } else if (carimbo >= CAL_CARIMBO_COM_HORA) {
    char iso[32];
    formatarIso((uint64_t)carimbo * 1000000ULL, iso, sizeof(iso));  // 2026-11-17T14:32:00.000000Z
    n = snprintf(buf, tamanho, "%c-%.4s%.2s%.2sT%.2s%.2s%.2sZ", CODIGOS[ponto], iso, iso + 5, iso + 8, iso + 11,
                 iso + 14, iso + 17);
  } else {
    n = snprintf(buf, tamanho, "%c-semhora-%lu", CODIGOS[ponto], (unsigned long)carimbo);
  }
  if (n < 0 || (size_t)n >= tamanho) return 0;
  return (size_t)n;
}

// ---------------------------------------------------------------- comandos

// Copia a próxima palavra (até `max`-1 caracteres) e avança o ponteiro; false se não há palavra.
static bool palavra(const char*& p, char* destino, size_t max) {
  while (*p == ' ' || *p == '\t') p++;
  if (!*p) return false;
  size_t i = 0;
  while (*p && *p != ' ' && *p != '\t') {
    if (i + 1 >= max) return false;
    destino[i++] = (char)tolower((unsigned char)*p++);
  }
  destino[i] = '\0';
  return true;
}

ComandoCal lerComandoCal(const char* texto) {
  ComandoCal c = {false, 0, AcaoCal::MOSTRAR};
  if (!texto) return c;
  const char* p = texto;
  char p1[8], p2[4], p3[12], resto[4];
  if (!palavra(p, p1, sizeof(p1)) || strcmp(p1, "cal") != 0) return c;
  if (!palavra(p, p2, sizeof(p2)) || strlen(p2) != 1 || p2[0] < 'a' || p2[0] > 'c') return c;
  if (!palavra(p, p3, sizeof(p3))) return c;
  if (palavra(p, resto, sizeof(resto)) || *p) return c;  // palavra a mais
  if (strcmp(p3, "cima") == 0) c.acao = AcaoCal::CIMA;
  else if (strcmp(p3, "baixo") == 0) c.acao = AcaoCal::BAIXO;
  else if (strcmp(p3, "fim") == 0) c.acao = AcaoCal::FIM;
  else if (strcmp(p3, "mostrar") == 0) c.acao = AcaoCal::MOSTRAR;
  else if (strcmp(p3, "limpar") == 0) c.acao = AcaoCal::LIMPAR;
  else return c;
  c.ponto = p2[0] - 'a';
  c.valido = true;
  return c;
}

// ---------------------------------------------------------------- arquivo

size_t formatarArquivoCal(const CalibracaoPonto cal[3], uint32_t proximaSerie, char* buf, size_t tamanho) {
  size_t usado = 0;
  int n = snprintf(buf, tamanho, "pscal 1\n");
  if (n < 0 || (size_t)n >= tamanho) return 0;
  usado = (size_t)n;
  for (int i = 0; i < 3; i++) {
    if (cal[i].calibrado) {
      n = snprintf(buf + usado, tamanho - usado, "%c %.3f %.1f %lu\n", CODIGOS[i], (double)cal[i].ganhoLsbPorG,
                   (double)cal[i].offsetLsb, (unsigned long)cal[i].carimbo);
    } else {
      n = snprintf(buf + usado, tamanho - usado, "%c -\n", CODIGOS[i]);
    }
    if (n < 0 || usado + (size_t)n >= tamanho) return 0;
    usado += (size_t)n;
  }
  n = snprintf(buf + usado, tamanho - usado, "serie %lu\n", (unsigned long)proximaSerie);
  if (n < 0 || usado + (size_t)n >= tamanho) return 0;
  return usado + (size_t)n;
}

bool lerArquivoCal(const char* texto, CalibracaoPonto cal[3], uint32_t* proximaSerie) {
  for (int i = 0; i < 3; i++) cal[i] = {false, 0.0f, 0.0f, 0};
  *proximaSerie = 1;
  if (!texto || strncmp(texto, "pscal 1\n", 8) != 0) return false;
  const char* p = texto + 8;
  while (*p) {
    const char* fim = strchr(p, '\n');
    size_t tam = fim ? (size_t)(fim - p) : strlen(p);
    char linha[64];
    if (tam < sizeof(linha)) {
      memcpy(linha, p, tam);
      linha[tam] = '\0';
      char codigo;
      float ganho, offset;
      unsigned long carimbo;
      if (sscanf(linha, "serie %lu", &carimbo) == 1) {
        if (carimbo >= 1 && carimbo < CAL_CARIMBO_COM_HORA) *proximaSerie = (uint32_t)carimbo;
      } else if (sscanf(linha, "%c %f %f %lu", &codigo, &ganho, &offset, &carimbo) == 4 && codigo >= 'A' &&
                 codigo <= 'C' && ganho >= CAL_GANHO_MIN && ganho <= CAL_GANHO_MAX && carimbo > 0) {
        cal[codigo - 'A'] = {true, ganho, offset, (uint32_t)carimbo};
      }
    }
    if (!fim) break;
    p = fim + 1;
  }
  return true;
}

}  // namespace ps
