#include "LarguraPulso.h"

namespace ps {

void LarguraPulso::borda(uint32_t instanteUs, bool nivelDepois) {
  if (!nivelDepois) {
    // descida: começa um pulso (uma descida repetida, sem a subida no meio, recomeça a contagem)
    emPulso_ = true;
    inicio_ = instanteUs;
    return;
  }
  if (!emPulso_) return;  // subida sem descida antes (partida no meio de um pulso): ignora
  emPulso_ = false;
  uint32_t largura = instanteUs - inicio_;  // aritmética sem sinal atravessa o estouro do micros()
  if (pulsos_ == 0 || largura < minimo_) minimo_ = largura;
  soma_ += largura;
  pulsos_++;
}

LarguraPulso::Janela LarguraPulso::fecharJanela() {
  Janela j;
  j.pulsos = pulsos_;
  if (pulsos_ > 0) {
    j.minimoUs = minimo_;
    j.medioUs = (uint32_t)(soma_ / pulsos_);
  }
  pulsos_ = 0;
  minimo_ = 0;
  soma_ = 0;
  return j;
}

}  // namespace ps
