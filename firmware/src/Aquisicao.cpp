#include "Aquisicao.h"

#include <Arduino.h>
#include <SPI.h>
#include <sys/time.h>

#include "Adxl345.h"
#include "Caracteristicas.h"
#include "Config.h"
#include "Estado.h"
#include "Protocolo.h"
#include "Rotacao.h"

namespace aquisicao {

namespace {

Adxl345 sensores[3];
bool presente[3] = {false, false, false};
ps::AcumuladorPonto acumuladores[3];
ps::Rotacao rotacao(cfg::ROTACAO_PERIODO_MINIMO_US, cfg::ROTACAO_SEM_PULSO_US);

// Média e taxa medidas na janela anterior de cada sensor (deslocamento e Hann da próxima)
double mediaAnterior[3] = {0, 0, 0};
double taxaMedida[3] = {cfg::TAXA_NOMINAL_HZ, cfg::TAXA_NOMINAL_HZ, cfg::TAXA_NOMINAL_HZ};
bool temMedia[3] = {false, false, false};

// Bordas da rotação: a interrupção só guarda o instante; o laço repassa para `rotacao`
const uint32_t TAMANHO_BORDAS = 32;  // potência de 2
volatile uint32_t bordas[TAMANHO_BORDAS];
volatile uint32_t cabecaBordas = 0;
uint32_t caudaBordas = 0;

// Janela atual
uint32_t proximoTick = 0;
uint32_t inicioJanelaMcu = 0;
uint32_t fimJanelaMcu = 0;
uint64_t inicioJanelaEpoch = 0;
bool janelaComHora = false;
bool janelaRapida = false;
uint32_t duracaoJanelaS = cfg::JANELA_NORMAL_S;
float rpmBase = 0;  // rotação da janela anterior: fixa as frequências das ordens
bool saturouJanela = false;
Diagnostico diag = {};
uint64_t somaDefasagem = 0;
uint32_t ticksComDefasagem = 0;
uint32_t ultimaLeituraUs[3] = {0, 0, 0};
uint32_t janelasPerdidas = 0;

// Sinal bruto
uint8_t seqQuadro = 0;
int16_t brutos[3][ps::QUADRO_MAX_POR_SENSOR * 3];
uint8_t quadro[ps::QUADRO_MAX];

void IRAM_ATTR aoDetectarBorda() {
  uint32_t agora = micros();
  uint32_t c = cabecaBordas;
  bordas[c & (TAMANHO_BORDAS - 1)] = agora;
  cabecaBordas = c + 1;
}

uint64_t agoraEpochUs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000000ULL + (uint64_t)tv.tv_usec;
}

// Hora sincronizada por NTP: qualquer instante depois de 2026-01-01
bool horaSincronizada(uint64_t epochUs) {
  return epochUs > 1767225600ULL * 1000000ULL;
}

void comecarJanela(uint32_t agoraMcu) {
  uint64_t epoch = agoraEpochUs();
  uint64_t rapidoAte = estado::modoRapidoAte();
  janelaRapida = rapidoAte > epoch;
  duracaoJanelaS = janelaRapida ? cfg::JANELA_RAPIDA_S : cfg::JANELA_NORMAL_S;
  inicioJanelaMcu = agoraMcu;
  fimJanelaMcu = agoraMcu + duracaoJanelaS * 1000000UL;
  inicioJanelaEpoch = epoch;
  janelaComHora = horaSincronizada(epoch);
  saturouJanela = false;
  diag = {};
  somaDefasagem = 0;
  ticksComDefasagem = 0;
  for (int s = 0; s < 3; s++) {
    if (!presente[s]) continue;
    uint32_t comprimento = (uint32_t)(taxaMedida[s] * duracaoJanelaS + 0.5);
    acumuladores[s].iniciar(mediaAnterior[s], taxaMedida[s], comprimento, rpmBase / 60.0);
  }
}

void fecharJanela(uint32_t agoraMcu) {
  double duracao = (double)(agoraMcu - inicioJanelaMcu) / 1e6;
  ps::Rotacao::Janela rot = rotacao.fecharJanela(agoraMcu);
  bool ordensOk = ps::ordensValidas(rpmBase, rot.rpm, rot.variacao, cfg::ROTACAO_LIMITE_VARIACAO);

  JanelaPronta j;
  memset(&j, 0, sizeof(j));
  j.dados.versao = ps::VERSAO_DADOS_JANELA;
  j.dados.modoRapido = janelaRapida ? 1 : 0;
  j.dados.inicioUs = inicioJanelaEpoch;
  j.dados.rotacaoRpm = rot.rpm;
  j.dados.amostrasEsperadas = cfg::TAXA_NOMINAL_HZ * duracaoJanelaS;
  j.horaValida = janelaComHora;

  uint32_t menor = UINT32_MAX;
  bool saturou = saturouJanela;
  for (int s = 0; s < 3; s++) {
    if (!presente[s]) continue;
    ps::ResultadoPonto r = acumuladores[s].concluir(cfg::ESCALA_G);
    ps::MedidaPonto& m = j.dados.pontos[s];
    m.presente = true;
    m.rmsG = r.rmsG;
    m.picoG = r.picoG;
    m.curtose = r.curtose;
    m.o1x = ordensOk ? r.o1x : 0.0f;
    m.o2x = ordensOk ? r.o2x : 0.0f;
    m.o3x = ordensOk ? r.o3x : 0.0f;
    saturou = saturou || r.saturou;
    if (r.amostras < menor) menor = r.amostras;
    diag.amostrasSensor[s] = r.amostras;
    if (r.amostras > 0 && duracao > 0.5) {
      taxaMedida[s] = r.amostras / duracao;
      diag.taxaHz[s] = (float)taxaMedida[s];
      mediaAnterior[s] = acumuladores[s].media();
      temMedia[s] = true;
    }
  }
  j.dados.amostras = menor == UINT32_MAX ? 0 : menor;
  j.dados.saturou = saturou ? 1 : 0;
  diag.defasagemAcMediaUs = ticksComDefasagem ? (uint32_t)(somaDefasagem / ticksComDefasagem) : 0;
  diag.variacaoRotacao = rot.variacao;
  diag.ordensValidas = ordensOk ? 1 : 0;
  diag.janelasPerdidas = janelasPerdidas;
  j.diag = diag;

  // sem bloqueio: se o núcleo 0 estiver atrasado, a janela é perdida, e não a aquisição
  if (xQueueSend(estado::janelas, &j, 0) != pdTRUE) janelasPerdidas++;

  rpmBase = rot.rpm;
  comecarJanela(agoraMcu);
}

void esperarPausaFifo(int s) {
  while (micros() - ultimaLeituraUs[s] < cfg::PAUSA_FIFO_US) {
  }
}

void processarAmostra(int s, const int16_t xyz[3]) {
  for (int e = 0; e < 3; e++) {
    if (xyz[e] >= cfg::LIMITE_SATURACAO || xyz[e] <= -cfg::LIMITE_SATURACAO) {
      saturouJanela = true;
      acumuladores[s].marcarSaturacao();
    }
  }
  int16_t valor = xyz[cfg::EIXO_PONTO[s]];
  if (!temMedia[s]) {
    // primeira janela: a primeira amostra serve de deslocamento (evita somar o DC inteiro)
    mediaAnterior[s] = valor;
    temMedia[s] = true;
    uint32_t comprimento = (uint32_t)(taxaMedida[s] * duracaoJanelaS + 0.5);
    acumuladores[s].iniciar(mediaAnterior[s], taxaMedida[s], comprimento, rpmBase / 60.0);
  }
  acumuladores[s].amostra(valor);
}

const char* nomeEstado(EstadoSensor e) {
  switch (e) {
    case EstadoSensor::OK: return "OK";
    case EstadoSensor::FALHA: return "FALHA";
    default: return "ausente";
  }
}

}  // namespace

void iniciar() {
  SPI.begin(cfg::PINO_SCK, cfg::PINO_MISO, cfg::PINO_MOSI, -1);
  for (int s = 0; s < 3; s++) sensores[s].configurarPino(cfg::PINO_CS[s]);
  delay(50);

  for (int s = 0; s < 3; s++) {
    uint8_t devid = sensores[s].lerDevid();
    EstadoSensor e = EstadoSensor::AUSENTE;
    if (devid == 0xE5) {
      int16_t dif[3];
      bool ok = sensores[s].autoteste(dif);
      e = ok ? EstadoSensor::OK : EstadoSensor::FALHA;
      Serial.printf("#sensor %s: DEVID=0x%02X autoteste %s (dX=%d dY=%d dZ=%d LSB)\n", ps::CODIGOS_PONTOS[s],
                    devid, ok ? "OK" : "FALHA", dif[0], dif[1], dif[2]);
    } else {
      Serial.printf("#sensor %s: DEVID=0x%02X (esperado 0xE5): %s\n", ps::CODIGOS_PONTOS[s], devid,
                    nomeEstado(e));
    }
    presente[s] = e == EstadoSensor::OK;
    if (presente[s]) sensores[s].configurarAquisicao();
    portENTER_CRITICAL(&estado::trava);
    estado::painel.sensores[s] = e;
    portEXIT_CRITICAL(&estado::trava);
  }

  pinMode(cfg::PINO_ROTACAO, INPUT_PULLDOWN);
  // FC-51: a saída vai a 0 quando a faixa refletiva passa na frente do sensor
  attachInterrupt(digitalPinToInterrupt(cfg::PINO_ROTACAO), aoDetectarBorda, FALLING);

  uint32_t agora = micros();
  proximoTick = agora + cfg::TICK_US;
  comecarJanela(agora);
}

void passo() {
  while ((int32_t)(micros() - proximoTick) < 0) {
    // espera ativa: período determinístico, sem depender do tick do sistema operacional
  }
  uint32_t inicio = micros();
  if ((int32_t)(inicio - proximoTick) > (int32_t)cfg::TICK_US) {
    diag.ticksAtrasados++;
    // muito atrasado: retoma a partir de agora em vez de tentar recuperar ticks perdidos
    if ((int32_t)(inicio - proximoTick) > (int32_t)(10 * cfg::TICK_US)) proximoTick = inicio;
  }
  proximoTick += cfg::TICK_US;

  // quantas amostras cada FIFO tem agora
  uint8_t n[3] = {0, 0, 0};
  uint8_t maior = 0;
  for (int s = 0; s < 3; s++) {
    if (!presente[s]) continue;
    uint8_t e = sensores[s].entradasFifo();
    if (e > ps::QUADRO_MAX_POR_SENSOR) e = ps::QUADRO_MAX_POR_SENSOR;
    n[s] = e;
    ultimaLeituraUs[s] = micros();
    if (e > maior) maior = e;
  }

  // leitura intercalada A, B, C, A, B, C...: os três no mesmo tick
  uint32_t tA = 0, tC = 0;
  bool bruto = estado::brutoLigado;
  for (uint8_t r = 0; r < maior; r++) {
    for (int s = 0; s < 3; s++) {
      if (r >= n[s]) continue;
      esperarPausaFifo(s);
      if (r == 0 && s == 0) tA = micros();
      if (r == 0 && s == 2) tC = micros();
      int16_t xyz[3];
      sensores[s].lerAmostra(xyz);
      ultimaLeituraUs[s] = micros();
      processarAmostra(s, xyz);
      if (bruto) {
        brutos[s][r * 3 + 0] = xyz[0];
        brutos[s][r * 3 + 1] = xyz[1];
        brutos[s][r * 3 + 2] = xyz[2];
      }
    }
  }
  if (n[0] > 0 && n[2] > 0) {
    uint32_t d = tC - tA;
    somaDefasagem += d;
    ticksComDefasagem++;
    if (d > diag.defasagemAcMaxUs) diag.defasagemAcMaxUs = d;
  }

  // bordas da rotação
  uint32_t cabeca = cabecaBordas;
  if (cabeca - caudaBordas > TAMANHO_BORDAS) caudaBordas = cabeca - TAMANHO_BORDAS;  // estouro: fica com as mais novas
  while (caudaBordas != cabeca) {
    rotacao.borda(bordas[caudaBordas & (TAMANHO_BORDAS - 1)]);
    caudaBordas++;
  }

  if (bruto) {
    const int16_t* ptr[3] = {brutos[0], brutos[1], brutos[2]};
    uint8_t ir = (uint8_t)digitalRead(cfg::PINO_ROTACAO);
    size_t t = ps::montarQuadro(seqQuadro++, inicio, ir, n, ptr, quadro, sizeof(quadro));
    // só escreve se couber no buffer de saída: escrever com o buffer cheio travaria a aquisição
    if (t > 0 && Serial.availableForWrite() >= (int)t) {
      Serial.write(quadro, t);
    } else {
      diag.quadrosBrutosPerdidos++;
    }
  }

  uint32_t fim = micros();
  if (fim - inicio > diag.tickMaxUs) diag.tickMaxUs = fim - inicio;

  if ((int32_t)(fim - fimJanelaMcu) >= 0) {
    fecharJanela(fim);
  }
}

}  // namespace aquisicao
