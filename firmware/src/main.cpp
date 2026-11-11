// Firmware PredictSpin: 3 ADXL345 (pontos A, B, C) e rotação pelo FC-51 num ESP32.
//
// Núcleo 1: aquisição (loop do Arduino). Lê as três FIFO no mesmo tick a 1600 amostras/s por
//           sensor, calcula as características em fluxo e entrega cada janela sem esperar a rede.
// Núcleo 0: rede (Wi-Fi, NTP, fila, HTTPS) e interface (tela, LEDs, botão, comandos da serial).
//
// Detalhes de pinos, núcleos, filtragem, fila e protocolo serial em docs/firmware.md.
#include <Arduino.h>

#include "Aquisicao.h"
#include "Config.h"
#include "Estado.h"
#include "Interface.h"
#include "Rede.h"

void setup() {
  Serial.setTxBufferSize(8192);  // folga para o sinal bruto (~35 KB/s) sem bloquear a aquisição
  Serial.begin(cfg::SERIAL_BAUD);
  delay(200);
  Serial.println();
  Serial.println("#inicio PredictSpin firmware 3 sensores");

  estado::iniciar();
  aquisicao::iniciar();  // núcleo 1 (o setup e o loop rodam no núcleo 1)
  rede::iniciar();       // tarefa no núcleo 0
  interface::iniciar();  // tarefa no núcleo 0
  Serial.printf("#heap livre depois da partida: %lu bytes\n", (unsigned long)ESP.getFreeHeap());
}

void loop() {
  aquisicao::passo();
}
