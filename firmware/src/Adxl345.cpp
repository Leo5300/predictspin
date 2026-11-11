#include "Adxl345.h"

#include "Config.h"

namespace {
const uint8_t REG_DEVID = 0x00;
const uint8_t REG_BW_RATE = 0x2C;
const uint8_t REG_POWER_CTL = 0x2D;
const uint8_t REG_DATA_FORMAT = 0x31;
const uint8_t REG_DATAX0 = 0x32;
const uint8_t REG_FIFO_CTL = 0x38;
const uint8_t REG_FIFO_STATUS = 0x39;

const uint8_t BW_RATE_1600HZ = 0x0E;     // ODR 1600 Hz, banda de 800 Hz (ODR/2)
const uint8_t FORMATO_16G_TOTAL = 0x0B;  // FULL_RES, ±16 g, SPI de 4 fios
const uint8_t BIT_SELF_TEST = 0x80;
const uint8_t MEDICAO = 0x08;
const uint8_t FIFO_BYPASS = 0x00;
const uint8_t FIFO_STREAM = 0x80;

// Limites do autoteste (datasheet, tabela de especificações): 2,5 V -> X 50..540, Y -540..-50,
// Z 75..875 LSB; para 3,3 V multiplica por 1,77 (X, Y) e 1,47 (Z).
const int16_t AUTOTESTE_MIN[3] = {89, -956, 110};
const int16_t AUTOTESTE_MAX[3] = {956, -89, 1286};

SPISettings spiCfg(cfg::SPI_HZ, MSBFIRST, SPI_MODE3);
}  // namespace

void Adxl345::configurarPino(int pinoCs) {
  cs_ = pinoCs;
  pinMode(cs_, OUTPUT);
  digitalWrite(cs_, HIGH);
}

uint8_t Adxl345::ler(uint8_t registrador) {
  SPI.beginTransaction(spiCfg);
  digitalWrite(cs_, LOW);
  SPI.transfer(registrador | 0x80);
  uint8_t valor = SPI.transfer(0x00);
  digitalWrite(cs_, HIGH);
  SPI.endTransaction();
  return valor;
}

void Adxl345::escrever(uint8_t registrador, uint8_t valor) {
  SPI.beginTransaction(spiCfg);
  digitalWrite(cs_, LOW);
  SPI.transfer(registrador & 0x3F);
  SPI.transfer(valor);
  digitalWrite(cs_, HIGH);
  SPI.endTransaction();
}

uint8_t Adxl345::lerDevid() {
  return ler(REG_DEVID);
}

void Adxl345::lerAmostra(int16_t xyz[3]) {
  uint8_t b[6];
  SPI.beginTransaction(spiCfg);
  digitalWrite(cs_, LOW);
  SPI.transfer(REG_DATAX0 | 0x80 | 0x40);  // leitura de vários bytes: os 6 de uma vez tiram 1 entrada
  for (int i = 0; i < 6; i++) b[i] = SPI.transfer(0x00);
  digitalWrite(cs_, HIGH);
  SPI.endTransaction();
  xyz[0] = (int16_t)((b[1] << 8) | b[0]);
  xyz[1] = (int16_t)((b[3] << 8) | b[2]);
  xyz[2] = (int16_t)((b[5] << 8) | b[4]);
}

uint8_t Adxl345::entradasFifo() {
  return ler(REG_FIFO_STATUS) & 0x3F;
}

void Adxl345::mediaDireta(int quantidade, int32_t soma[3]) {
  soma[0] = soma[1] = soma[2] = 0;
  int16_t xyz[3];
  for (int i = 0; i < quantidade; i++) {
    delayMicroseconds(700);  // > 1/1600 s: cada leitura pega uma amostra nova
    lerAmostra(xyz);
    for (int e = 0; e < 3; e++) soma[e] += xyz[e];
  }
}

bool Adxl345::autoteste(int16_t diferenca[3]) {
  const int n = 100;
  escrever(REG_POWER_CTL, 0x00);
  escrever(REG_FIFO_CTL, FIFO_BYPASS);
  escrever(REG_BW_RATE, BW_RATE_1600HZ);
  escrever(REG_DATA_FORMAT, FORMATO_16G_TOTAL);
  escrever(REG_POWER_CTL, MEDICAO);
  delay(20);
  int32_t sem[3], com[3];
  mediaDireta(n, sem);
  escrever(REG_DATA_FORMAT, FORMATO_16G_TOTAL | BIT_SELF_TEST);
  delay(20);  // assentamento: bem mais que 4 períodos de amostra
  mediaDireta(n, com);
  escrever(REG_DATA_FORMAT, FORMATO_16G_TOTAL);
  delay(20);
  bool ok = true;
  for (int e = 0; e < 3; e++) {
    diferenca[e] = (int16_t)((com[e] - sem[e]) / n);
    if (diferenca[e] < AUTOTESTE_MIN[e] || diferenca[e] > AUTOTESTE_MAX[e]) ok = false;
  }
  return ok;
}

void Adxl345::configurarAquisicao() {
  escrever(REG_POWER_CTL, 0x00);  // espera enquanto configura
  escrever(REG_BW_RATE, BW_RATE_1600HZ);
  escrever(REG_DATA_FORMAT, FORMATO_16G_TOTAL);
  escrever(REG_FIFO_CTL, FIFO_BYPASS);  // bypass zera a FIFO
  escrever(REG_FIFO_CTL, FIFO_STREAM);
  escrever(REG_POWER_CTL, MEDICAO);
}
