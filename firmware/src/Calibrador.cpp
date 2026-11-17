#include "Calibrador.h"

#include <Arduino.h>
#include <LittleFS.h>
#include <time.h>

#include "Aquisicao.h"
#include "Calibracao.h"
#include "Config.h"
#include "Estado.h"

namespace calibrador {

namespace {

const char* const ARQUIVO = "/cal.txt";
const char NOMES_EIXOS[3] = {'x', 'y', 'z'};

ps::CalibracaoPonto cal[3] = {};
uint32_t proximaSerie = 1;
bool sistemaArquivos = false;

// Posições já medidas e ainda não concluídas com "fim"
double cima[3], baixo[3];
bool temCima[3] = {false, false, false};
bool temBaixo[3] = {false, false, false};

void publicar(int s) {
  estado::definirCalibracao(s, ps::escalaG(cal[s], cfg::ESCALA_G), cal[s].calibrado ? cal[s].carimbo : 0);
}

bool gravar() {
  if (!sistemaArquivos) return false;
  char texto[160];
  size_t n = ps::formatarArquivoCal(cal, proximaSerie, texto, sizeof(texto));
  if (n == 0) return false;
  File f = LittleFS.open(ARQUIVO, "w");
  if (!f) return false;
  bool ok = f.write((const uint8_t*)texto, n) == n;
  f.close();
  return ok;
}

void idDe(int s, char* buf, size_t tamanho) {
  ps::formatarIdCalibracao(s, cal[s].calibrado ? cal[s].carimbo : 0, buf, tamanho);
}

void mostrar(int s) {
  char id[32];
  idDe(s, id, sizeof(id));
  char pendente[64];
  snprintf(pendente, sizeof(pendente), "cima=%s baixo=%s", temCima[s] ? String(cima[s], 1).c_str() : "-",
           temBaixo[s] ? String(baixo[s], 1).c_str() : "-");
  if (cal[s].calibrado) {
    Serial.printf("# cal %c: %s ganho=%.3f LSB/g (%.4f mg/LSB) offset=%.1f LSB eixo=%c | medido: %s\n",
                  'A' + s, id, (double)cal[s].ganhoLsbPorG, 1000.0 / cal[s].ganhoLsbPorG, (double)cal[s].offsetLsb,
                  NOMES_EIXOS[cfg::EIXO_PONTO[s]], pendente);
  } else {
    Serial.printf("# cal %c: nominal (%.1f mg/LSB, sem calibração) eixo=%c | medido: %s\n", 'A' + s,
                  cfg::ESCALA_G * 1000.0, NOMES_EIXOS[cfg::EIXO_PONTO[s]], pendente);
  }
}

// Mede 2 s do eixo de análise do ponto. false com a explicação já impressa.
bool medir(int s, ps::MediaDesvio* m) {
  uint32_t amostras = cfg::TAXA_NOMINAL_HZ * ps::CAL_DURACAO_MS / 1000;
  if (!aquisicao::pedirMedidaCal(s, amostras)) {
    Serial.printf("# cal %c recusada: sensor ausente ou com falha, ou outra medida em andamento\n", 'A' + s);
    return false;
  }
  Serial.printf("# cal %c: medindo por %lu s, não toque no sensor...\n", 'A' + s,
                (unsigned long)(ps::CAL_DURACAO_MS / 1000));
  uint32_t inicio = millis();
  while (!aquisicao::medidaCalPronta(m)) {
    if (millis() - inicio > ps::CAL_DURACAO_MS + 1500) {
      aquisicao::cancelarMedidaCal();
      Serial.printf("# cal %c recusada: %s\n", 'A' + s, ps::explicar(ps::ResultadoCal::POUCAS_AMOSTRAS));
      return false;
    }
    delay(20);
  }
  return true;
}

void posicao(int s, bool deCima) {
  ps::MediaDesvio m;
  if (!medir(s, &m)) return;
  ps::ResultadoCal r = ps::avaliarLeitura(m);
  const char* nome = deCima ? "cima" : "baixo";
  if (r != ps::ResultadoCal::OK) {
    Serial.printf("# cal %c %s recusada: média=%.1f desvio=%.1f LSB (%lu amostras): %s\n", 'A' + s, nome, m.media(),
                  m.desvio(), (unsigned long)m.n(), ps::explicar(r));
    char aviso[26];
    snprintf(aviso, sizeof(aviso), "CAL %c %s RECUSADA", 'A' + s, nome);
    estado::mostrarAviso(aviso, 10000);
    return;
  }
  if (deCima) {
    cima[s] = m.media();
    temCima[s] = true;
  } else {
    baixo[s] = m.media();
    temBaixo[s] = true;
  }
  Serial.printf("# cal %c %s ok: média=%.1f desvio=%.1f LSB (%lu amostras)\n", 'A' + s, nome, m.media(), m.desvio(),
                (unsigned long)m.n());
  char aviso[26];
  snprintf(aviso, sizeof(aviso), "CAL %c %s %.0f", 'A' + s, nome, m.media());
  estado::mostrarAviso(aviso, 10000);
}

void concluir(int s) {
  ps::ResultadoCal r = !temCima[s]    ? ps::ResultadoCal::FALTA_CIMA
                       : !temBaixo[s] ? ps::ResultadoCal::FALTA_BAIXO
                                      : ps::ResultadoCal::OK;
  double ganho = 0, offset = 0;
  if (r == ps::ResultadoCal::OK) r = ps::calcularCalibracao(cima[s], baixo[s], &ganho, &offset);
  if (r != ps::ResultadoCal::OK) {
    Serial.printf("# cal %c fim recusada: %s\n", 'A' + s, ps::explicar(r));
    char aviso[26];
    snprintf(aviso, sizeof(aviso), "CAL %c RECUSADA", 'A' + s);
    estado::mostrarAviso(aviso, 10000);
    return;
  }
  time_t agora = time(nullptr);
  uint32_t carimbo;
  if ((uint32_t)agora >= ps::CAL_CARIMBO_COM_HORA) {
    carimbo = (uint32_t)agora;
  } else {
    carimbo = proximaSerie++;  // sem hora sincronizada: número de série
  }
  cal[s] = {true, (float)ganho, (float)offset, carimbo};
  temCima[s] = temBaixo[s] = false;
  publicar(s);
  bool gravou = gravar();
  char id[32];
  idDe(s, id, sizeof(id));
  Serial.printf("# cal %c gravada: %s ganho=%.3f LSB/g offset=%.1f LSB%s\n", 'A' + s, id, ganho, offset,
                gravou ? "" : " (NÃO gravada no LittleFS: vale só até reiniciar)");
  char aviso[26];
  snprintf(aviso, sizeof(aviso), "CAL %c %.1f LSB/g", 'A' + s, ganho);
  estado::mostrarAviso(aviso, 15000);
}

void limpar(int s) {
  cal[s] = {false, 0.0f, 0.0f, 0};
  temCima[s] = temBaixo[s] = false;
  publicar(s);
  bool gravou = gravar();
  Serial.printf("# cal %c limpa: volta ao nominal de %.1f mg/LSB%s\n", 'A' + s, cfg::ESCALA_G * 1000.0,
                gravou ? "" : " (arquivo não atualizado)");
  char aviso[26];
  snprintf(aviso, sizeof(aviso), "CAL %c NOMINAL", 'A' + s);
  estado::mostrarAviso(aviso, 10000);
}

}  // namespace

void iniciar() {
  sistemaArquivos = LittleFS.begin(true);
  bool leu = false;
  if (sistemaArquivos && LittleFS.exists(ARQUIVO)) {
    File f = LittleFS.open(ARQUIVO, "r");
    if (f) {
      char texto[200];
      size_t n = f.read((uint8_t*)texto, sizeof(texto) - 1);
      texto[n] = '\0';
      f.close();
      leu = ps::lerArquivoCal(texto, cal, &proximaSerie);
    }
  }
  if (!leu) {
    for (auto& c : cal) c = {false, 0.0f, 0.0f, 0};
    proximaSerie = 1;
  }
  for (int s = 0; s < 3; s++) publicar(s);
  char linha[96];
  resumo(linha, sizeof(linha));
  Serial.printf("#calibracao: %s%s\n", linha, sistemaArquivos ? "" : " (LittleFS FALHOU: sem arquivo)");
}

void tratarComando(const char* texto) {
  ps::ComandoCal c = ps::lerComandoCal(texto);
  if (!c.valido) {
    Serial.println("# uso: cal A|B|C cima|baixo|fim|mostrar|limpar");
    return;
  }
  switch (c.acao) {
    case ps::AcaoCal::CIMA: posicao(c.ponto, true); break;
    case ps::AcaoCal::BAIXO: posicao(c.ponto, false); break;
    case ps::AcaoCal::FIM: concluir(c.ponto); break;
    case ps::AcaoCal::MOSTRAR: mostrar(c.ponto); break;
    case ps::AcaoCal::LIMPAR: limpar(c.ponto); break;
  }
}

void resumo(char* buf, size_t tamanho) {
  size_t usado = 0;
  buf[0] = '\0';
  for (int s = 0; s < 3 && usado < tamanho; s++) {
    char id[32];
    idDe(s, id, sizeof(id));
    int n = snprintf(buf + usado, tamanho - usado, "%s%c=%s", s ? " " : "", 'A' + s, id);
    if (n < 0) return;
    usado += (size_t)n;
  }
}

}  // namespace calibrador
