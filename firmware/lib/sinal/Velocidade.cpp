#include "Velocidade.h"

#include <math.h>

namespace ps {

static const double PI_D = 3.141592653589793;

void Velocidade::configurar(double taxaHz, double corteHz) {
  if (taxaHz <= 0.0 || corteHz <= 0.0 || corteHz >= taxaHz / 2.0) {
    taxaHz = 1600.0;
    corteHz = 10.0;
  }
  double t = 1.0 / taxaHz;
  double k = tan(PI_D * corteHz / taxaHz);  // pré-distorção: o corte fica exato em corteHz
  k_ = (float)k;
  a_ = (float)(1.0 - k);
  b_ = (float)exp(-2.0 * PI_D * corteHz * t);
  c_ = (float)(t / 8.0);
}

void Velocidade::reiniciar() {
  comEstado_ = false;
  xAnterior_ = 0.0f;
  yAnterior_ = 0.0f;
  v_ = 0.0f;
}

void Velocidade::comecarJanela() {
  somaV2_ = 0.0;
  n_ = 0;
}

void Velocidade::amostra(int16_t lsb) {
  float x = (float)lsb;
  if (!comEstado_) {
    // a primeira amostra vira a referência: um degrau de 1 g (gravidade) não entra no integrador
    xAnterior_ = x;
    comEstado_ = true;
  }
  float y = (x - xAnterior_ + a_ * yAnterior_) / (1.0f + k_);
  v_ = b_ * v_ + c_ * (7.0f * y + yAnterior_);
  xAnterior_ = x;
  yAnterior_ = y;
  somaV2_ += (double)v_ * (double)v_;
  n_++;
}

double Velocidade::rmsMmS(double escalaG) const {
  if (n_ == 0) return 0.0;
  return sqrt(somaV2_ / (double)n_) * escalaG * MM_S2_POR_G;
}

bool janelaCompleta(uint32_t amostras, uint32_t previstas) {
  return previstas > 0 && (uint64_t)amostras * 100u >= (uint64_t)previstas * 98u;
}

}  // namespace ps
