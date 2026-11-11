// Estado compartilhado entre os núcleos. O núcleo 1 (aquisição) só escreve o que ele mede e só lê
// campos de 32 bits ou protegidos por trava curta, para nunca esperar a rede.
#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include "Adxl345.h"
#include "AlertaLocal.h"
#include "Protocolo.h"

// Diagnóstico de uma janela, medido no núcleo 1
struct Diagnostico {
  uint32_t defasagemAcMaxUs;    // maior atraso entre a leitura do A e a do C dentro de um tick
  uint32_t defasagemAcMediaUs;
  uint32_t tickMaxUs;           // maior duração do trabalho de um tick
  uint32_t ticksAtrasados;      // ticks que começaram mais de 1 tick depois do previsto
  uint32_t amostrasSensor[3];
  float taxaHz[3];              // taxa medida de cada sensor (amostras / duração da janela)
  uint32_t quadrosBrutosPerdidos;
  uint32_t janelasPerdidas;     // acumulado desde a partida: fila do FreeRTOS cheia
  float variacaoRotacao;
  uint8_t ordensValidas;
};

// Janela pronta, do núcleo 1 para o núcleo 0
struct JanelaPronta {
  ps::DadosJanela dados;
  bool horaValida;
  Diagnostico diag;
};

enum class EstadoRede : uint8_t { SEM_WIFI, CONECTADO, CHAVE_INVALIDA };

struct Painel {
  // escrito pelo núcleo 1 na partida
  EstadoSensor sensores[3];
  // escrito pelo núcleo 0
  EstadoRede rede;
  bool horaOk;
  uint32_t fila;
  int ultimoHttp;            // 0 = nenhum envio ainda; < 0 = erro de conexão do HTTPClient
  uint32_t ultimoEnvioMs;    // millis() da última resposta
  uint32_t descartadas;      // 400/403
  float rpm;
  ps::MedidaPonto ultima[3];
  ps::EstadoAlerta alertas[3];
  uint8_t progressoAprendizado;
  uint32_t janelaS;          // duração da janela atual
};

namespace estado {

extern QueueHandle_t janelas;  // JanelaPronta, do núcleo 1 para o 0
extern Painel painel;
extern portMUX_TYPE trava;

// Até quando vale o modo rápido (µs desde 1970); 0 = desligado. 64 bits: lido sob trava.
void definirModoRapidoAte(uint64_t epochUs);
uint64_t modoRapidoAte();

// Sinal bruto na serial (comando "bruto 1"/"bruto 0")
extern volatile bool brutoLigado;
// Pedido de reaprender o RMS normal (botão BOOT ou comando "aprende")
extern volatile bool pedidoReaprender;

// Cópia do painel sob trava
Painel copiarPainel();

void iniciar();

}  // namespace estado
