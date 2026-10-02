// Leitura de um ADXL345 por SPI a 1600 Hz, com referencia de rotacao (HW-006),
// enviada pela serial em CSV: t_us,ax,ay,az,ir
//
// Ligacao (GY-291 -> ESP32):
//   VCC -> 3V3 | GND -> GND | CS -> GPIO5 | SDO -> GPIO19 (MISO)
//   SDA -> GPIO23 (MOSI) | SCL -> GPIO18 (SCK) | INT1/INT2 nao ligados
// HW-006: VCC -> 3V3 | GND -> GND | DO -> GPIO4

#include <SPI.h>

const int PIN_SCK  = 18;
const int PIN_MISO = 19;
const int PIN_MOSI = 23;
const int PIN_CS   = 5;
const int PIN_IR   = 4;

const uint32_t FS_HZ      = 1600;
const uint32_t PERIODO_US = 1000000UL / FS_HZ;  // 625 us
const uint32_t SPI_HZ     = 2000000;            // clock reduzido: mais margem com cabo longo

const uint8_t REG_DEVID       = 0x00;
const uint8_t REG_BW_RATE     = 0x2C;
const uint8_t REG_POWER_CTL   = 0x2D;
const uint8_t REG_DATA_FORMAT = 0x31;
const uint8_t REG_DATAX0      = 0x32;

SPISettings spiCfg(SPI_HZ, MSBFIRST, SPI_MODE3);

uint8_t lerRegistro(uint8_t reg) {
  SPI.beginTransaction(spiCfg);
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg | 0x80);
  uint8_t valor = SPI.transfer(0x00);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
  return valor;
}

void escreverRegistro(uint8_t reg, uint8_t valor) {
  SPI.beginTransaction(spiCfg);
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(reg & 0x3F);
  SPI.transfer(valor);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
}

void lerXYZ(int16_t &x, int16_t &y, int16_t &z) {
  uint8_t b[6];
  SPI.beginTransaction(spiCfg);
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(REG_DATAX0 | 0x80 | 0x40);  // leitura multibyte
  for (int i = 0; i < 6; i++) b[i] = SPI.transfer(0x00);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
  x = (int16_t)((b[1] << 8) | b[0]);
  y = (int16_t)((b[3] << 8) | b[2]);
  z = (int16_t)((b[5] << 8) | b[4]);
}

void setup() {
  Serial.setTxBufferSize(2048);
  Serial.begin(921600);

  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_IR, INPUT);
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_CS);
  delay(100);

  uint8_t id = lerRegistro(REG_DEVID);
  if (id != 0xE5) {
    while (true) {
      Serial.printf("#erro DEVID=0x%02X (esperado 0xE5) - confira a ligacao\n", id);
      delay(1000);
    }
  }

  escreverRegistro(REG_DATA_FORMAT, 0x0B);  // resolucao total (3,9 mg/LSB), +-16 g, SPI 4 fios
  escreverRegistro(REG_BW_RATE, 0x0F);      // ODR 3200 Hz: cada leitura a 1600 Hz pega amostra nova
  escreverRegistro(REG_POWER_CTL, 0x08);    // modo medicao
  delay(50);

  Serial.println("#inicio");
  Serial.println("t_us,ax,ay,az,ir");
}

void loop() {
  static uint32_t proximo = micros();

  while ((int32_t)(micros() - proximo) < 0) {
    // espera ativa: periodo deterministico, sem depender do tick do sistema
  }
  uint32_t t = micros();
  proximo += PERIODO_US;

  int16_t x, y, z;
  lerXYZ(x, y, z);
  int ir = digitalRead(PIN_IR);

  Serial.printf("%lu,%d,%d,%d,%d\n", (unsigned long)t, x, y, z, ir);
}
