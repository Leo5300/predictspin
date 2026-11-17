// Velocidade de vibração RMS (mm/s) de um ponto, calculada em fluxo, sem guardar a janela. O estado
// dos filtros continua de uma janela para a outra. Lógica pura.
//
//   aceleração (LSB) -> passa-alta de 1ª ordem em 10 Hz -> integrador com vazamento em 10 Hz -> v
//
// O passa-alta tira a gravidade e o offset antes de integrar; o vazamento impede que a integral
// derive. Juntos, aproximam s / (s + wc)^2: acima de ~30 Hz é a integral da aceleração; em 10 Hz o
// ganho cai à metade (banda declarada a partir de 10 Hz).
//
// Discretização: passa-alta pela transformação bilinear com pré-distorção no corte; integrador pela
// regra de Al-Alaoui, v[n] = b v[n-1] + T (7 u[n] + u[n-1]) / 8, que fica a menos de 2% do modelo
// contínuo de 5 a 400 Hz a 1600 amostras/s (a regra retangular erra +13% em 400 Hz; a trapezoidal,
// -20%). Tabela da resposta em docs/firmware.md.
#pragma once

#include <stdint.h>

namespace ps {

// mm/s² por g (gravidade padrão)
static const double MM_S2_POR_G = 9806.65;

class Velocidade {
 public:
  // Coeficientes para a taxa do sensor e o corte (Hz). Não mexe no estado dos filtros.
  void configurar(double taxaHz, double corteHz);
  // Zera os filtros: a próxima amostra recomeça do zero (partida ou falta de amostras).
  void reiniciar();
  // Zera só a soma da janela.
  void comecarJanela();
  void amostra(int16_t lsb);
  // RMS da velocidade na janela, em mm/s, com a escala do ponto (g por LSB)
  double rmsMmS(double escalaG) const;
  uint32_t amostras() const { return n_; }

 private:
  // passa-alta: y[n] = (x[n] - x[n-1] + a y[n-1]) / (1 + K), a = 1 - K
  float k_ = 0.0f;
  float a_ = 0.0f;
  // integrador: v[n] = b v[n-1] + c (7 y[n] + y[n-1]), c = T / 8
  float b_ = 0.0f;
  float c_ = 0.0f;
  bool comEstado_ = false;
  float xAnterior_ = 0.0f;
  float yAnterior_ = 0.0f;
  float v_ = 0.0f;
  double somaV2_ = 0.0;  // em (LSB.s)^2
  uint32_t n_ = 0;
};

// Janela completa para a velocidade: chegaram pelo menos 98% das amostras previstas na taxa medida
// do sensor. A velocidade de uma janela só vai ao payload se ela e a anterior estão completas: a
// primeira janela depois da partida ou de uma falta de amostras fica sem o campo, para o integrador
// acomodar.
bool janelaCompleta(uint32_t amostras, uint32_t previstas);

}  // namespace ps
