#include "Caracteristicas.h"

#include <math.h>

namespace ps {

static const double DOIS_PI = 6.283185307179586;

void Goertzel::iniciar(double frequenciaHz, double taxaHz) {
  s1_ = 0.0;
  s2_ = 0.0;
  ativo_ = frequenciaHz > 0.0 && taxaHz > 0.0 && frequenciaHz < taxaHz / 2.0;
  coef_ = ativo_ ? 2.0 * cos(DOIS_PI * frequenciaHz / taxaHz) : 0.0;
}

void Goertzel::amostra(double x) {
  double s = x + coef_ * s1_ - s2_;
  s2_ = s1_;
  s1_ = s;
}

double Goertzel::magnitude() const {
  double p = s1_ * s1_ + s2_ * s2_ - coef_ * s1_ * s2_;
  return p > 0.0 ? sqrt(p) : 0.0;
}

void AcumuladorPonto::iniciar(double deslocamento, double taxaHz, uint32_t comprimento, double rotacaoHz) {
  k_ = deslocamento;
  s1_ = s2_ = s3_ = s4_ = 0.0;
  minimo_ = 32767;
  maximo_ = -32768;
  n_ = 0;
  comprimento_ = comprimento;
  somaPesos_ = 0.0;
  passoHann_ = comprimento > 1 ? DOIS_PI / (double)(comprimento - 1) : 0.0;
  // cos e sen do ângulo da janela de Hann, atualizados por rotação a cada amostra: evita um cos()
  // por amostra (no ESP32 o double é emulado em software)
  cosPasso_ = cos(passoHann_);
  senPasso_ = sin(passoHann_);
  cosAtual_ = 1.0;
  senAtual_ = 0.0;
  saturou_ = false;
  for (int i = 0; i < 3; i++) {
    ordens_[i].iniciar(rotacaoHz > 0.0 ? rotacaoHz * (i + 1) : 0.0, taxaHz);
  }
}

void AcumuladorPonto::amostra(int16_t valor) {
  double d = (double)valor - k_;
  double d2 = d * d;
  s1_ += d;
  s2_ += d2;
  s3_ += d2 * d;
  s4_ += d2 * d2;
  if (valor < minimo_) minimo_ = valor;
  if (valor > maximo_) maximo_ = valor;

  // Hann só dentro do comprimento previsto; amostras além dele (sensor com relógio adiantado)
  // entram nos momentos, mas não nas ordens.
  if (n_ < comprimento_ && passoHann_ > 0.0) {
    double peso = 0.5 - 0.5 * cosAtual_;
    double c = cosAtual_ * cosPasso_ - senAtual_ * senPasso_;
    senAtual_ = senAtual_ * cosPasso_ + cosAtual_ * senPasso_;
    cosAtual_ = c;
    somaPesos_ += peso;
    double x = d * peso;
    for (int i = 0; i < 3; i++) {
      if (ordens_[i].ativo()) ordens_[i].amostra(x);
    }
  }
  n_++;
}

double AcumuladorPonto::media() const {
  return n_ ? k_ + s1_ / (double)n_ : k_;
}

ResultadoPonto AcumuladorPonto::concluir(double escalaG) const {
  ResultadoPonto r;
  r.amostras = n_;
  r.saturou = saturou_;
  if (n_ == 0) return r;

  double n = (double)n_;
  double mu = s1_ / n;  // média de (x - k)
  double m2 = s2_ / n - mu * mu;
  if (m2 < 0.0) m2 = 0.0;
  double m4 = s4_ / n - 4.0 * mu * s3_ / n + 6.0 * mu * mu * s2_ / n - 3.0 * mu * mu * mu * mu;

  double media = k_ + mu;
  double pico = (double)maximo_ - media;
  if (media - (double)minimo_ > pico) pico = media - (double)minimo_;

  r.rmsG = (float)(sqrt(m2) * escalaG);
  r.picoG = (float)(pico * escalaG);
  // Sinal constante (variância zero) não tem curtose definida: envia 0
  r.curtose = m2 > 1e-12 ? (float)(m4 / (m2 * m2)) : 0.0f;

  float *saida[3] = {&r.o1x, &r.o2x, &r.o3x};
  for (int i = 0; i < 3; i++) {
    double amp = 0.0;
    if (ordens_[i].ativo() && somaPesos_ > 0.0) {
      amp = 2.0 * ordens_[i].magnitude() / somaPesos_;
    }
    *saida[i] = (float)(amp * escalaG);
  }
  return r;
}

float curtose(const float* x, uint32_t n) {
  if (n == 0) return 0.0f;
  double media = 0.0;
  for (uint32_t i = 0; i < n; i++) media += x[i];
  media /= n;
  double m2 = 0.0, m4 = 0.0;
  for (uint32_t i = 0; i < n; i++) {
    double d = x[i] - media;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m4 /= n;
  return m2 > 1e-12 ? (float)(m4 / (m2 * m2)) : 0.0f;
}

bool ordensValidas(float rpmBase, float rpmAtual, float variacaoAtual, float limite) {
  if (rpmBase <= 0.0f || rpmAtual <= 0.0f) return false;
  if (variacaoAtual > limite) return false;
  float diferenca = fabsf(rpmAtual - rpmBase) / rpmBase;
  return diferenca <= limite;
}

}  // namespace ps
