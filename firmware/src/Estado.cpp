#include "Estado.h"

#include <string.h>

#include "Config.h"

namespace estado {

QueueHandle_t janelas = nullptr;
Painel painel = {};
portMUX_TYPE trava = portMUX_INITIALIZER_UNLOCKED;
volatile bool brutoLigado = false;
volatile bool pedidoReaprender = false;

static uint64_t modoRapidoAteUs = 0;
static float escalas[3] = {cfg::ESCALA_G, cfg::ESCALA_G, cfg::ESCALA_G};
static uint32_t carimbos[3] = {0, 0, 0};

void definirModoRapidoAte(uint64_t epochUs) {
  portENTER_CRITICAL(&trava);
  modoRapidoAteUs = epochUs;
  portEXIT_CRITICAL(&trava);
}

uint64_t modoRapidoAte() {
  portENTER_CRITICAL(&trava);
  uint64_t v = modoRapidoAteUs;
  portEXIT_CRITICAL(&trava);
  return v;
}

Painel copiarPainel() {
  portENTER_CRITICAL(&trava);
  Painel p = painel;
  portEXIT_CRITICAL(&trava);
  return p;
}

void mostrarAviso(const char* texto, uint32_t duracaoMs) {
  portENTER_CRITICAL(&trava);
  strncpy(painel.aviso, texto, sizeof(painel.aviso) - 1);
  painel.aviso[sizeof(painel.aviso) - 1] = '\0';
  painel.avisoAteMs = millis() + duracaoMs;
  if (painel.avisoAteMs == 0) painel.avisoAteMs = 1;
  portEXIT_CRITICAL(&trava);
}

void definirCalibracao(int ponto, float escalaG, uint32_t carimbo) {
  if (ponto < 0 || ponto > 2) return;
  portENTER_CRITICAL(&trava);
  escalas[ponto] = escalaG;
  carimbos[ponto] = carimbo;
  portEXIT_CRITICAL(&trava);
}

void lerCalibracao(float escalaG[3], uint32_t carimbo[3]) {
  portENTER_CRITICAL(&trava);
  for (int s = 0; s < 3; s++) {
    escalaG[s] = escalas[s];
    carimbo[s] = carimbos[s];
  }
  portEXIT_CRITICAL(&trava);
}

void iniciar() {
  // 16 janelas = 80 s de folga se o núcleo 0 travar; a fila de envio de verdade é a FilaJanelas
  janelas = xQueueCreate(16, sizeof(JanelaPronta));
  painel.ultimoHttp = 0;
  painel.janelaS = 5;
}

}  // namespace estado
