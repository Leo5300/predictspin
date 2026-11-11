// Características de vibração de uma janela, calculadas em fluxo (amostra a amostra), sem guardar
// a janela inteira. Lógica pura: compila no ESP32 e no computador (testes nativos).
#pragma once

#include <stdint.h>

namespace ps {

// Amplitude de um seno numa frequência qualquer (não precisa cair num bin inteiro) pelo algoritmo
// de Goertzel generalizado: |X(w)|^2 = s1^2 + s2^2 - 2 cos(w) s1 s2.
// Os estados ficam em double: em baixa frequência (1X de um torno, ~10 Hz a 1600 Hz) o coeficiente
// fica perto de 2 e a recorrência em float acumula erro ao longo de 8000 amostras.
class Goertzel {
 public:
  void iniciar(double frequenciaHz, double taxaHz);
  // x já ponderado pela janela e sem nível DC
  void amostra(double x);
  // |X(w)|, sem normalização
  double magnitude() const;
  bool ativo() const { return ativo_; }

 private:
  double coef_ = 0.0;
  double s1_ = 0.0;
  double s2_ = 0.0;
  bool ativo_ = false;
};

struct ResultadoPonto {
  float rmsG = 0;     // RMS sem o nível DC
  float picoG = 0;    // maior |x - media|
  float curtose = 0;  // momento central de 4a ordem / variancia^2 (3 para sinal gaussiano)
  float o1x = 0;      // amplitude de pico nas ordens 1X, 2X e 3X da rotação
  float o2x = 0;
  float o3x = 0;
  uint32_t amostras = 0;
  bool saturou = false;
};

// Acumula as características de um ponto (um eixo de um ADXL345) durante uma janela.
//
// - Momentos: somas de (x - k), (x - k)^2, (x - k)^3 e (x - k)^4 em double, com k = média da janela
//   anterior. O deslocamento evita o cancelamento numérico com o nível DC (gravidade no eixo Z).
// - Ordens: três Goertzel nas frequências 1X, 2X e 3X fixadas no início da janela (a rotação da
//   janela anterior), com janela de Hann de comprimento igual às amostras esperadas na taxa medida
//   do sensor. Hann derruba o vazamento do DC residual e de componentes vizinhas; a amplitude é
//   normalizada pela soma dos pesos.
class AcumuladorPonto {
 public:
  // deslocamento: média da janela anterior (LSB); taxaHz: taxa medida do sensor;
  // comprimento: amostras esperadas na janela; rotacaoHz <= 0 desliga as ordens.
  void iniciar(double deslocamento, double taxaHz, uint32_t comprimento, double rotacaoHz);
  void amostra(int16_t valor);
  void marcarSaturacao() { saturou_ = true; }
  // escalaG: g por LSB
  ResultadoPonto concluir(double escalaG) const;
  // Média da janela, em LSB (deslocamento da próxima)
  double media() const;
  uint32_t amostras() const { return n_; }

 private:
  double k_ = 0.0;
  double s1_ = 0.0, s2_ = 0.0, s3_ = 0.0, s4_ = 0.0;
  int16_t minimo_ = 0, maximo_ = 0;
  uint32_t n_ = 0;
  uint32_t comprimento_ = 0;
  double somaPesos_ = 0.0;
  double passoHann_ = 0.0;
  double cosPasso_ = 1.0, senPasso_ = 0.0, cosAtual_ = 1.0, senAtual_ = 0.0;
  Goertzel ordens_[3];
  bool saturou_ = false;
};

// Momentos de uma janela já completa (usado nos testes e na conferência do cálculo em fluxo).
float curtose(const float* x, uint32_t n);

// Decide se as ordens da janela atual valem: rotação parada ou instável manda 0.
// rpmBase: rotação usada para fixar as frequências (a da janela anterior);
// rpmAtual e variacaoAtual: medidos na própria janela; limite: fração (0,05 = 5%).
bool ordensValidas(float rpmBase, float rpmAtual, float variacaoAtual, float limite);

}  // namespace ps
