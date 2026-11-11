#include "Interface.h"

#include <Adafruit_NeoPixel.h>
#include <Arduino.h>
#include <U8g2lib.h>
#include <Wire.h>
#include <time.h>

#include "Config.h"
#include "Estado.h"

namespace interface {

namespace {

U8G2_SSD1306_128X64_NONAME_F_HW_I2C tela(U8G2_R0, U8X8_PIN_NONE, cfg::PINO_TELA_SCL, cfg::PINO_TELA_SDA);
Adafruit_NeoPixel leds(cfg::QUANTIDADE_LEDS, cfg::PINO_LEDS, NEO_GRB + NEO_KHZ800);

// Cores já na intensidade final; o brilho global ainda limita a 25%
const uint32_t VERDE = Adafruit_NeoPixel::Color(0, 120, 0);
const uint32_t AMBAR = Adafruit_NeoPixel::Color(200, 90, 0);
const uint32_t VERMELHO = Adafruit_NeoPixel::Color(220, 0, 0);
const uint32_t AZUL = Adafruit_NeoPixel::Color(0, 0, 160);
const uint32_t APAGADO = 0;

char comando[40];
size_t tamanhoComando = 0;

const char* textoSensor(EstadoSensor e) {
  switch (e) {
    case EstadoSensor::OK: return "OK";
    case EstadoSensor::FALHA: return "FA";
    default: return "--";
  }
}

ps::EstadoAlerta piorAlerta(const Painel& p) {
  ps::EstadoAlerta pior = ps::EstadoAlerta::NORMAL;
  bool algum = false;
  for (int s = 0; s < 3; s++) {
    if (p.sensores[s] != EstadoSensor::OK) continue;
    algum = true;
    if (p.alertas[s] == ps::EstadoAlerta::APRENDENDO) return ps::EstadoAlerta::APRENDENDO;
    if ((uint8_t)p.alertas[s] > (uint8_t)pior) pior = p.alertas[s];
  }
  return algum ? pior : ps::EstadoAlerta::NORMAL;
}

void desenharTela(const Painel& p) {
  char l[40];
  tela.clearBuffer();
  tela.setFont(u8g2_font_5x8_tr);

  snprintf(l, sizeof(l), "A:%s B:%s C:%s %5.0frpm", textoSensor(p.sensores[0]), textoSensor(p.sensores[1]),
           textoSensor(p.sensores[2]), p.rpm);
  tela.drawStr(0, 7, l);

  const char* rede = p.rede == EstadoRede::CHAVE_INVALIDA ? "CHAVE INVALIDA"
                     : p.rede == EstadoRede::CONECTADO     ? "WiFi ok"
                                                            : "sem WiFi";
  if (p.horaOk) {
    time_t agora = time(nullptr);
    struct tm t;
    gmtime_r(&agora, &t);
    snprintf(l, sizeof(l), "%-9s %02d:%02d:%02dZ", rede, t.tm_hour, t.tm_min, t.tm_sec);
  } else {
    snprintf(l, sizeof(l), "%-9s sem hora", rede);
  }
  tela.drawStr(0, 16, l);

  if (p.ultimoHttp == 0) {
    snprintf(l, sizeof(l), "fila %lu  sem envio", (unsigned long)p.fila);
  } else {
    unsigned long ha = (millis() - p.ultimoEnvioMs) / 1000;
    snprintf(l, sizeof(l), "fila %lu HTTP %d ha %lus", (unsigned long)p.fila, p.ultimoHttp, ha);
  }
  tela.drawStr(0, 25, l);

  uint64_t ate = estado::modoRapidoAte();
  if (ate) {
    time_t s = (time_t)(ate / 1000000ULL);
    struct tm t;
    gmtime_r(&s, &t);
    snprintf(l, sizeof(l), "RAPIDO 1s ate %02d:%02d:%02dZ", t.tm_hour, t.tm_min, t.tm_sec);
  } else {
    snprintf(l, sizeof(l), "modo normal (%lus)", (unsigned long)p.janelaS);
  }
  tela.drawStr(0, 34, l);

  for (int s = 0; s < 3; s++) {
    const char* est = "";
    switch (p.alertas[s]) {
      case ps::EstadoAlerta::APRENDENDO: est = "aprend"; break;
      case ps::EstadoAlerta::NORMAL: est = "normal"; break;
      case ps::EstadoAlerta::ATENCAO: est = "ATENCAO"; break;
      case ps::EstadoAlerta::ALARME: est = "ALARME"; break;
    }
    if (p.ultima[s].presente) {
      snprintf(l, sizeof(l), "%s %.4fg %.3fg %s", ps::CODIGOS_PONTOS[s], p.ultima[s].rmsG, p.ultima[s].picoG, est);
    } else {
      snprintf(l, sizeof(l), "%s ---", ps::CODIGOS_PONTOS[s]);
    }
    tela.drawStr(0, 43 + 9 * s, l);
  }
  tela.sendBuffer();
}

// Estado sempre redundante: cor e quantidade de LEDs (ou piscar)
void desenharLeds(const Painel& p, uint32_t agoraMs) {
  bool pisca2Hz = (agoraMs / 250) % 2;
  bool pisca1Hz = (agoraMs / 500) % 2;
  leds.clear();

  // anel 1 (0 a 6): vibração, o pior ponto
  switch (piorAlerta(p)) {
    case ps::EstadoAlerta::APRENDENDO: {
      int n = 1 + (p.progressoAprendizado * (cfg::LEDS_POR_ANEL - 1)) / cfg::JANELAS_APRENDIZADO;
      for (int i = 0; i < n; i++) leds.setPixelColor(i, AZUL);
      break;
    }
    case ps::EstadoAlerta::NORMAL:
      leds.setPixelColor(0, VERDE);  // discreto: 1 LED
      break;
    case ps::EstadoAlerta::ATENCAO:
      for (int i = 0; i < 4; i++) leds.setPixelColor(i, AMBAR);
      break;
    case ps::EstadoAlerta::ALARME:
      if (pisca2Hz) {
        for (int i = 0; i < cfg::LEDS_POR_ANEL; i++) leds.setPixelColor(i, VERMELHO);
      }
      break;
  }

  // anel 2 (7 a 13): 7 = rede, 8 a 10 = sensores A, B, C, 11 = hora, 12 e 13 = fila
  const int b = cfg::LEDS_POR_ANEL;
  if (p.rede == EstadoRede::CHAVE_INVALIDA) {
    for (int i = 0; i < cfg::LEDS_POR_ANEL; i++) leds.setPixelColor(b + i, VERMELHO);  // anel todo vermelho
  } else {
    if (p.rede == EstadoRede::CONECTADO && p.ultimoHttp >= 200 && p.ultimoHttp < 300) {
      leds.setPixelColor(b, VERDE);
    } else if (pisca1Hz) {
      leds.setPixelColor(b, AMBAR);  // sem Wi-Fi ou envio falhando: pisca
    }
    for (int s = 0; s < 3; s++) {
      if (p.sensores[s] == EstadoSensor::OK) {
        leds.setPixelColor(b + 1 + s, VERDE);
      } else if (p.sensores[s] == EstadoSensor::FALHA && pisca1Hz) {
        leds.setPixelColor(b + 1 + s, VERMELHO);  // falha pisca; ausente fica apagado
      }
    }
    leds.setPixelColor(b + 4, p.horaOk ? VERDE : AMBAR);
    if (p.fila > 12) leds.setPixelColor(b + 5, AMBAR);   // mais de 1 min acumulado
    if (p.fila > 360) leds.setPixelColor(b + 6, AMBAR);  // mais de 30 min
  }
  leds.show();
}

void executarComando(const char* c) {
  if (strcmp(c, "bruto 1") == 0) {
    Serial.println("# bruto ligado: daqui em diante a serial é binária (bruto 0 desliga)");
    Serial.flush();
    estado::brutoLigado = true;
  } else if (strcmp(c, "bruto 0") == 0) {
    estado::brutoLigado = false;
    delay(20);
    Serial.println();
    Serial.println("# bruto desligado");
  } else if (strcmp(c, "aprende") == 0) {
    estado::pedidoReaprender = true;
    if (!estado::brutoLigado) Serial.println("# reaprendendo o RMS normal nas próximas janelas");
  } else if (strcmp(c, "estado") == 0 && !estado::brutoLigado) {
    Painel p = estado::copiarPainel();
    Serial.printf("# estado: sensores %s/%s/%s rede=%d hora=%d fila=%lu http=%d heap_livre=%lu\n",
                  textoSensor(p.sensores[0]), textoSensor(p.sensores[1]), textoSensor(p.sensores[2]),
                  (int)p.rede, p.horaOk, (unsigned long)p.fila, p.ultimoHttp, (unsigned long)ESP.getFreeHeap());
  } else if (c[0] && !estado::brutoLigado) {
    Serial.println("# comandos: bruto 1 | bruto 0 | aprende | estado");
  }
}

void lerSerial() {
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      comando[tamanhoComando] = '\0';
      executarComando(comando);
      tamanhoComando = 0;
    } else if (tamanhoComando < sizeof(comando) - 1) {
      comando[tamanhoComando++] = ch;
    }
  }
}

void tarefa(void*) {
  pinMode(cfg::PINO_TELA_VCC, OUTPUT);
  digitalWrite(cfg::PINO_TELA_VCC, HIGH);  // o pino 27 alimenta a tela
  delay(100);
  tela.begin();
  leds.begin();
  leds.setBrightness(cfg::BRILHO_MAXIMO);
  leds.clear();
  leds.show();
  pinMode(cfg::PINO_BOTAO, INPUT_PULLUP);

  bool botaoAntes = true;
  uint32_t ultimaTela = 0;
  for (;;) {
    uint32_t agora = millis();
    lerSerial();

    bool botao = digitalRead(cfg::PINO_BOTAO);
    if (botaoAntes && !botao) {
      estado::pedidoReaprender = true;
      if (!estado::brutoLigado) Serial.println("# botão BOOT: reaprendendo o RMS normal");
    }
    botaoAntes = botao;

    Painel p = estado::copiarPainel();
    desenharLeds(p, agora);
    if (agora - ultimaTela >= 500) {
      ultimaTela = agora;
      desenharTela(p);
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

}  // namespace

void iniciar() {
  xTaskCreatePinnedToCore(tarefa, "interface", 6144, nullptr, 1, nullptr, 0);
}

}  // namespace interface
