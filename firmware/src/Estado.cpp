#include "Estado.h"

namespace estado {

QueueHandle_t janelas = nullptr;
Painel painel = {};
portMUX_TYPE trava = portMUX_INITIALIZER_UNLOCKED;
volatile bool brutoLigado = false;
volatile bool pedidoReaprender = false;

static uint64_t modoRapidoAteUs = 0;

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

void iniciar() {
  // 16 janelas = 80 s de folga se o núcleo 0 travar; a fila de envio de verdade é a FilaJanelas
  janelas = xQueueCreate(16, sizeof(JanelaPronta));
  painel.ultimoHttp = 0;
  painel.janelaS = 5;
}

}  // namespace estado
