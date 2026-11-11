#include "Rotacao.h"

namespace ps {

Rotacao::Rotacao(uint32_t periodoMinimoUs, uint32_t semPulsoUs)
    : periodoMinimo_(periodoMinimoUs), semPulso_(semPulsoUs) {}

bool Rotacao::borda(uint32_t instanteUs) {
  if (!temBorda_) {
    temBorda_ = true;
    ultimaBorda_ = instanteUs;
    bordas_++;
    return true;
  }
  uint32_t periodo = instanteUs - ultimaBorda_;  // aritmética sem sinal atravessa o estouro do micros()
  if (periodo < periodoMinimo_) {
    return false;
  }
  ultimaBorda_ = instanteUs;
  bordas_++;
  if (periodo > semPulso_) {
    // a máquina estava parada: esta borda recomeça a contagem, sem formar período
    ultimoPeriodo_ = 0;
    return true;
  }
  ultimoPeriodo_ = periodo;
  periodos_++;
  somaPeriodos_ += periodo;
  if (periodos_ == 1 || periodo < menorPeriodo_) menorPeriodo_ = periodo;
  if (periodos_ == 1 || periodo > maiorPeriodo_) maiorPeriodo_ = periodo;
  return true;
}

float Rotacao::rpmAtual(uint32_t agoraUs) const {
  if (!temBorda_ || ultimoPeriodo_ == 0) return 0.0f;
  if (agoraUs - ultimaBorda_ > semPulso_) return 0.0f;
  return 60e6f / (float)ultimoPeriodo_;
}

Rotacao::Janela Rotacao::fecharJanela(uint32_t agoraUs) {
  Janela j;
  j.bordas = bordas_;
  bool parada = !temBorda_ || (agoraUs - ultimaBorda_ > semPulso_);
  if (!parada) {
    if (periodos_ > 0) {
      double medio = (double)somaPeriodos_ / (double)periodos_;
      j.rpm = (float)(60e6 / medio);
      j.variacao = (float)((double)(maiorPeriodo_ - menorPeriodo_) / medio);
    } else if (ultimoPeriodo_ > 0) {
      j.rpm = 60e6f / (float)ultimoPeriodo_;
    }
  }
  periodos_ = 0;
  somaPeriodos_ = 0;
  menorPeriodo_ = 0;
  maiorPeriodo_ = 0;
  bordas_ = 0;
  return j;
}

}  // namespace ps
