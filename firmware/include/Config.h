// Configuração do firmware: pinos, taxas, janelas e limites. Pinos conforme a montagem da bancada
// (ESP32 DOIT DevKit V1 de 30 pinos); não troque sem trocar a fiação. Detalhes em docs/firmware.md.
#pragma once

#include <stdint.h>

namespace cfg {

// ---------------------------------------------------------------- pinos
// SPI compartilhado pelos três ADXL345; um CS por ponto (A, B, C)
constexpr int PINO_SCK = 18;
constexpr int PINO_MISO = 19;
constexpr int PINO_MOSI = 23;
constexpr int PINO_CS[3] = {5, 16, 17};

// FC-51 (infravermelho, 1 pulso por volta). Entrada com pull-down.
constexpr int PINO_ROTACAO = 4;

// Tela OLED SSD1306 0,96" I2C 0x3C. O pino 27 alimenta a tela.
constexpr int PINO_TELA_VCC = 27;
constexpr int PINO_TELA_SCL = 26;
constexpr int PINO_TELA_SDA = 25;

// Dois módulos WS2812 de 7 LEDs em cascata: 0 a 6 = vibração, 7 a 13 = rede e sensores
constexpr int PINO_LEDS = 32;
constexpr int QUANTIDADE_LEDS = 14;
constexpr int LEDS_POR_ANEL = 7;

// Botão BOOT da placa: reaprende o RMS normal
constexpr int PINO_BOTAO = 0;

// Livres para sensores futuros (não usar): 13, 14, 33, 21, 22, 34, 35, 36, 39.
// Evitados por afetarem o boot: 12, 15, 2.

// ---------------------------------------------------------------- aquisição
constexpr uint32_t SPI_HZ = 2000000;           // abaixo do máximo de 5 MHz: margem para cabo longo
constexpr uint32_t TAXA_NOMINAL_HZ = 1600;     // ODR do ADXL345 (BW_RATE = 0x0E, banda de 800 Hz)
constexpr uint32_t TICK_US = 2000;             // a cada 2 ms o núcleo 1 esvazia as FIFO (~3 amostras)
constexpr float ESCALA_G = 0.0039f;            // 3,9 mg/LSB em resolução total (mesmo valor dos scripts)
constexpr int16_t LIMITE_SATURACAO = 4090;     // |bruto| >= 4090 em qualquer eixo marca a janela
constexpr uint32_t PAUSA_FIFO_US = 5;          // datasheet: >= 5 us entre leituras da FIFO do mesmo sensor

// Eixo de análise de cada ponto: 0 = X, 1 = Y, 2 = Z. Padrão Z, perpendicular à face do ímã.
constexpr uint8_t EIXO_PONTO[3] = {2, 2, 2};

// ---------------------------------------------------------------- janelas
constexpr uint32_t JANELA_NORMAL_S = 5;
constexpr uint32_t JANELA_RAPIDA_S = 1;

// ---------------------------------------------------------------- rotação
constexpr uint32_t ROTACAO_PERIODO_MINIMO_US = 15000;  // antirrepique: acima de 4000 rpm é repique
constexpr uint32_t ROTACAO_SEM_PULSO_US = 2000000;     // 2 s sem pulso: rotação 0
constexpr float ROTACAO_LIMITE_VARIACAO = 0.05f;       // acima de 5% de variação, ordens = 0

// ---------------------------------------------------------------- rede
constexpr const char* NTP_1 = "pool.ntp.org";
constexpr const char* NTP_2 = "a.st1.ntp.br";
constexpr uint32_t HTTP_TEMPO_CONEXAO_MS = 10000;
constexpr uint32_t HTTP_TEMPO_RESPOSTA_MS = 20000;
constexpr uint32_t WIFI_INTERVALO_TENTATIVA_MS = 5000;
// LittleFS: 120 lotes de 32 janelas (3,9 KB cada) + 64 na RAM = 3904 janelas = 5 h 25 min a 5 s
constexpr uint16_t FILA_MAX_LOTES = 120;

// ---------------------------------------------------------------- indicação local
constexpr uint8_t JANELAS_APRENDIZADO = 16;
constexpr float FATOR_ALERTA = 1.6f;
constexpr uint8_t PERSISTENCIA_ALARME = 3;   // janelas seguidas acima de 1,6x para virar alarme
constexpr uint8_t BRILHO_MAXIMO = 64;        // 25% de 255

// ---------------------------------------------------------------- serial
constexpr uint32_t SERIAL_BAUD = 921600;

}  // namespace cfg
