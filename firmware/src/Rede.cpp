#include "Rede.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiMulti.h>
#include <time.h>

#include "AlertaLocal.h"
#include "Config.h"
#include "Estado.h"
#include "FilaJanelas.h"
#include "Protocolo.h"

#if __has_include("segredos.h")
#include "segredos.h"
#else
#error "Falta include/segredos.h: copie include/segredos.exemplo.h para include/segredos.h e preencha"
#endif

// Pacote de certificados raiz embutido pelo board_build.embed_files do platformio.ini
extern const uint8_t pacoteCertificados[] asm("_binary_data_cert_x509_crt_bundle_bin_start");

namespace rede {

namespace {

const char* const PASTA_FILA = "/fila";
const uint32_t MAGICO_LOTE = 0x31465350;  // "PSF1"

// Lotes da fila em arquivos /fila/NNNNNNNN.bin: cabeçalho (mágico, versão, quantidade) e as
// janelas como estão na memória.
class ArmazenamentoLittleFS : public ps::ArmazenamentoLotes {
 public:
  bool pronto = false;

  bool gravar(uint32_t seq, const ps::DadosJanela* j, uint16_t n) override {
    if (!pronto) return false;
    File f = LittleFS.open(caminho(seq), "w");
    if (!f) return false;
    uint32_t cab[2] = {MAGICO_LOTE, ((uint32_t)ps::VERSAO_DADOS_JANELA << 16) | n};
    bool ok = f.write((const uint8_t*)cab, sizeof(cab)) == sizeof(cab);
    ok = ok && f.write((const uint8_t*)j, sizeof(ps::DadosJanela) * n) == sizeof(ps::DadosJanela) * n;
    f.close();
    if (!ok) LittleFS.remove(caminho(seq));
    return ok;
  }

  uint16_t ler(uint32_t seq, ps::DadosJanela* destino, uint16_t max) override {
    if (!pronto) return 0;
    File f = LittleFS.open(caminho(seq), "r");
    if (!f) return 0;
    uint32_t cab[2];
    uint16_t n = 0;
    if (f.read((uint8_t*)cab, sizeof(cab)) == sizeof(cab) && cab[0] == MAGICO_LOTE &&
        (cab[1] >> 16) == ps::VERSAO_DADOS_JANELA) {
      n = (uint16_t)(cab[1] & 0xFFFF);
      if (n > max) n = max;
      size_t bytes = sizeof(ps::DadosJanela) * n;
      if (f.read((uint8_t*)destino, bytes) != bytes) n = 0;
    }
    f.close();
    return n;
  }

  void apagar(uint32_t seq) override {
    if (pronto) LittleFS.remove(caminho(seq));
  }

  bool limites(uint32_t* primeiro, uint32_t* ultimo) override {
    if (!pronto) return false;
    File pasta = LittleFS.open(PASTA_FILA);
    if (!pasta || !pasta.isDirectory()) return false;
    bool achou = false;
    for (File f = pasta.openNextFile(); f; f = pasta.openNextFile()) {
      uint32_t seq = strtoul(f.name(), nullptr, 10);  // name() é só o nome, sem a pasta
      if (!achou || seq < *primeiro) *primeiro = seq;
      if (!achou || seq > *ultimo) *ultimo = seq;
      achou = true;
    }
    return achou;
  }

 private:
  static String caminho(uint32_t seq) {
    char nome[32];
    snprintf(nome, sizeof(nome), "%s/%08lu.bin", PASTA_FILA, (unsigned long)seq);
    return String(nome);
  }
};

ArmazenamentoLittleFS armazenamento;
ps::FilaJanelas fila(&armazenamento, cfg::FILA_MAX_LOTES);
WiFiMulti wifi;
WiFiClientSecure cliente;
HTTPClient http;
ps::AlertaLocal alertas[3] = {
    ps::AlertaLocal(cfg::JANELAS_APRENDIZADO, cfg::FATOR_ALERTA, cfg::PERSISTENCIA_ALARME),
    ps::AlertaLocal(cfg::JANELAS_APRENDIZADO, cfg::FATOR_ALERTA, cfg::PERSISTENCIA_ALARME),
    ps::AlertaLocal(cfg::JANELAS_APRENDIZADO, cfg::FATOR_ALERTA, cfg::PERSISTENCIA_ALARME)};

char url[160];
char corpo[900];
uint32_t falhasSeguidas = 0;
uint32_t proximaTentativaMs = 0;
uint32_t ultimaTentativaWifiMs = 0;
bool ntpIniciado = false;
bool chaveInvalida = false;
uint32_t descartadasSemHora = 0;
uint32_t descartadasErro = 0;
int ultimoCodigo = 0;

bool horaOk() {
  return time(nullptr) > 1767225600;  // depois de 2026-01-01
}

const char* textoRede() {
  if (chaveInvalida) return "chave_invalida";
  if (WiFi.status() != WL_CONNECTED) return "sem_wifi";
  if (!horaOk()) return "sem_hora";
  return "ok";
}

void atualizarPainel(const JanelaPronta* j) {
  portENTER_CRITICAL(&estado::trava);
  estado::painel.rede = chaveInvalida ? EstadoRede::CHAVE_INVALIDA
                        : WiFi.status() == WL_CONNECTED ? EstadoRede::CONECTADO
                                                        : EstadoRede::SEM_WIFI;
  estado::painel.horaOk = horaOk();
  estado::painel.fila = fila.tamanho();
  estado::painel.ultimoHttp = ultimoCodigo;
  estado::painel.descartadas = descartadasErro;
  if (j) {
    estado::painel.rpm = j->dados.rotacaoRpm;
    estado::painel.janelaS = j->dados.modoRapido ? cfg::JANELA_RAPIDA_S : cfg::JANELA_NORMAL_S;
    for (int s = 0; s < 3; s++) {
      estado::painel.ultima[s] = j->dados.pontos[s];
      estado::painel.alertas[s] = alertas[s].estado();
    }
    uint8_t progresso = cfg::JANELAS_APRENDIZADO;
    for (int s = 0; s < 3; s++) {
      if (j->dados.pontos[s].presente && alertas[s].progresso() < progresso) progresso = alertas[s].progresso();
    }
    estado::painel.progressoAprendizado = progresso;
  }
  portEXIT_CRITICAL(&estado::trava);
}

void imprimirJanela(const JanelaPronta& j) {
  if (estado::brutoLigado) return;  // com o sinal bruto ligado, a serial é só binária
  char instante[32];
  ps::formatarIso(j.dados.inicioUs, instante, sizeof(instante));
  String linha = String("janela ") + (j.horaValida ? instante : "sem_hora") + " rpm=" +
                 String(j.dados.rotacaoRpm, 0) + (j.dados.modoRapido ? " modo=rapido" : " modo=normal");
  for (int s = 0; s < 3; s++) {
    const ps::MedidaPonto& p = j.dados.pontos[s];
    linha += String(" | ") + ps::CODIGOS_PONTOS[s];
    if (p.presente) {
      linha += " rms=" + String(p.rmsG, 4) + " pico=" + String(p.picoG, 4);
    } else {
      linha += " ---";
    }
  }
  linha += " | amostras=" + String(j.dados.amostras) + "/" + String(j.dados.amostrasEsperadas) +
           " fila=" + String(fila.tamanho()) + " rede=" + textoRede() + " http=" + String(ultimoCodigo);
  Serial.println(linha);

  const Diagnostico& d = j.diag;
  Serial.printf(
      "# defasagem_AC_us=%lu/%lu tick_max_us=%lu ticks_atrasados=%lu taxa_Hz=%.1f/%.1f/%.1f "
      "amostras=%lu/%lu/%lu ordens=%s variacao_rot=%.3f heap_livre=%lu heap_min=%lu fila_perdidas=%lu "
      "sem_hora=%lu descartadas=%lu janelas_perdidas=%lu quadros_perdidos=%lu\n",
      (unsigned long)d.defasagemAcMediaUs, (unsigned long)d.defasagemAcMaxUs, (unsigned long)d.tickMaxUs,
      (unsigned long)d.ticksAtrasados, d.taxaHz[0], d.taxaHz[1], d.taxaHz[2], (unsigned long)d.amostrasSensor[0],
      (unsigned long)d.amostrasSensor[1], (unsigned long)d.amostrasSensor[2], d.ordensValidas ? "ok" : "zero",
      d.variacaoRotacao, (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMinFreeHeap(),
      (unsigned long)fila.perdidas(), (unsigned long)descartadasSemHora, (unsigned long)descartadasErro,
      (unsigned long)d.janelasPerdidas, (unsigned long)d.quadrosBrutosPerdidos);
}

void tratarJanela(const JanelaPronta& j) {
  if (estado::pedidoReaprender) {
    estado::pedidoReaprender = false;
    for (auto& a : alertas) a.reaprender();
  }
  for (int s = 0; s < 3; s++) {
    if (j.dados.pontos[s].presente) alertas[s].atualizar(j.dados.pontos[s].rmsG);
  }
  bool algumPonto = false;
  for (int s = 0; s < 3; s++) algumPonto = algumPonto || j.dados.pontos[s].presente;
  if (!algumPonto) {
    // nenhum sensor OK: a API recusaria a janela sem pontos; só a linha da serial sai
  } else if (j.horaValida) {
    fila.colocar(j.dados);
  } else {
    descartadasSemHora++;  // a API recusaria um medido_em sem hora certa
  }
  imprimirJanela(j);
  atualizarPainel(&j);
}

void conectar() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!ntpIniciado) {
      configTzTime("UTC0", cfg::NTP_1, cfg::NTP_2);
      ntpIniciado = true;
    }
    return;
  }
  if (millis() - ultimaTentativaWifiMs < cfg::WIFI_INTERVALO_TENTATIVA_MS) return;
  ultimaTentativaWifiMs = millis();
  wifi.run(4000);
}

void enviarProxima() {
  ps::DadosJanela d;
  if (!fila.frente(&d)) return;
  size_t n = ps::montarJson(d, DISPOSITIVO_ID, corpo, sizeof(corpo));
  if (n == 0) {
    // não deveria acontecer: o corpo cabe com folga; descarta para não travar a fila
    fila.removerFrente();
    descartadasErro++;
    return;
  }
  int codigo = -1;
  String resposta;
  if (http.begin(cliente, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Dispositivo-Id", DISPOSITIVO_ID);
    http.addHeader("X-Dispositivo-Chave", DISPOSITIVO_CHAVE);
    codigo = http.POST((uint8_t*)corpo, n);
    if (codigo > 0) resposta = http.getString();
    http.end();  // com setReuse(true) a conexão TLS fica aberta para o próximo envio
  }
  ultimoCodigo = codigo;
  portENTER_CRITICAL(&estado::trava);
  estado::painel.ultimoEnvioMs = millis();
  portEXIT_CRITICAL(&estado::trava);

  switch (ps::decidir(codigo)) {
    case ps::Decisao::SUCESSO: {
      fila.removerFrente();
      falhasSeguidas = 0;
      proximaTentativaMs = 0;
      uint64_t ate = 0;
      estado::definirModoRapidoAte(ps::lerModoRapidoAte(resposta.c_str(), &ate) ? ate : 0);
      break;
    }
    case ps::Decisao::DESCARTAR:
      fila.removerFrente();
      descartadasErro++;
      if (!estado::brutoLigado) {
        Serial.printf("#erro HTTP %d: janela descartada (erro de programação, não reenvia): %s\n", codigo,
                      resposta.substring(0, 300).c_str());
      }
      break;
    case ps::Decisao::CHAVE_INVALIDA:
      chaveInvalida = true;
      if (!estado::brutoLigado) {
        Serial.println("#erro HTTP 401: chave do dispositivo recusada; envio parado até reiniciar");
      }
      break;
    case ps::Decisao::REENVIAR:
      falhasSeguidas++;
      proximaTentativaMs = millis() + ps::esperaReenvioMs(falhasSeguidas);
      if (!estado::brutoLigado) {
        Serial.printf("#envio falhou (%d), nova tentativa em %lu s\n", codigo,
                      (unsigned long)(ps::esperaReenvioMs(falhasSeguidas) / 1000));
      }
      break;
  }
}

void tarefa(void*) {
  armazenamento.pronto = LittleFS.begin(true);
  if (armazenamento.pronto && !LittleFS.exists(PASTA_FILA)) LittleFS.mkdir(PASTA_FILA);
  fila.iniciar();
  Serial.printf("#fila: %s, %u lotes guardados, capacidade %lu janelas\n",
                armazenamento.pronto ? "LittleFS ok" : "LittleFS FALHOU (só RAM)", fila.lotes(),
                (unsigned long)fila.capacidade());

  snprintf(url, sizeof(url), "%s/api/v1/telemetria", API_URL);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  wifi.addAP(WIFI_REDE_1, WIFI_SENHA_1);
  if (strlen(WIFI_REDE_2) > 0) wifi.addAP(WIFI_REDE_2, WIFI_SENHA_2);
  cliente.setCACertBundle(pacoteCertificados);  // verificação do certificado ligada
  http.setReuse(true);
  http.setConnectTimeout(cfg::HTTP_TEMPO_CONEXAO_MS);
  http.setTimeout(cfg::HTTP_TEMPO_RESPOSTA_MS);

  bool avisouHora = false;
  for (;;) {
    conectar();
    if (!avisouHora && horaOk()) {
      avisouHora = true;
      if (!estado::brutoLigado) Serial.println("#hora sincronizada por NTP");
    }

    JanelaPronta j;
    // espera curta por janela nova; com algo a enviar, não espera
    bool podeEnviar = !chaveInvalida && WiFi.status() == WL_CONNECTED && horaOk() && fila.tamanho() > 0 &&
                      (int32_t)(millis() - proximaTentativaMs) >= 0;
    TickType_t espera = podeEnviar ? 0 : pdMS_TO_TICKS(100);
    while (xQueueReceive(estado::janelas, &j, espera) == pdTRUE) {
      tratarJanela(j);
      espera = 0;
    }

    // o modo rápido acaba sozinho quando o prazo passa
    uint64_t ate = estado::modoRapidoAte();
    if (ate) {
      time_t agora = time(nullptr);
      if ((uint64_t)agora * 1000000ULL >= ate) estado::definirModoRapidoAte(0);
    }

    if (podeEnviar) enviarProxima();
    atualizarPainel(nullptr);
  }
}

}  // namespace

void iniciar() {
  xTaskCreatePinnedToCore(tarefa, "rede", 16384, nullptr, 2, nullptr, 0);
}

}  // namespace rede
