// ADXL345 por SPI (modo 3), ±16 g em resolução total, ODR 1600 Hz com a FIFO em modo stream.
#pragma once

#include <Arduino.h>
#include <SPI.h>

enum class EstadoSensor : uint8_t { AUSENTE, OK, FALHA };

class Adxl345 {
 public:
  void configurarPino(int pinoCs);

  // Lê DEVID: 0xE5 é ADXL345. Devolve o valor lido.
  uint8_t lerDevid();

  // Autoteste do datasheet (bit SELF_TEST de DATA_FORMAT): média de 100 leituras sem e com a força
  // eletrostática, diferença comparada com os limites para alimentação de 3,3 V.
  // diferenca recebe X, Y, Z em LSB.
  bool autoteste(int16_t diferenca[3]);

  // ODR 1600 Hz, ±16 g resolução total, FIFO stream, modo medição. Esvazia a FIFO.
  void configurarAquisicao();

  // Entradas disponíveis na FIFO (0 a 32, mais o registro de saída)
  uint8_t entradasFifo();

  // Lê uma amostra (tira uma entrada da FIFO): x, y, z em LSB
  void lerAmostra(int16_t xyz[3]);

 private:
  uint8_t ler(uint8_t registrador);
  void escrever(uint8_t registrador, uint8_t valor);
  void mediaDireta(int quantidade, int32_t soma[3]);

  int cs_ = -1;
};
