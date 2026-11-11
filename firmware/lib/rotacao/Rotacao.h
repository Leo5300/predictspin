// Rotação pelo período entre bordas do sensor FC-51 (1 pulso por volta). Lógica pura.
//
// A interrupção só guarda o instante da borda (micros); o laço de aquisição repassa os instantes
// para esta classe, que aplica o antirrepique e acumula os períodos da janela.
#pragma once

#include <stdint.h>

namespace ps {

class Rotacao {
 public:
  // periodoMinimoUs: bordas mais próximas que isso são repique e são ignoradas (define a rotação
  // máxima medível); semPulsoUs: sem borda aceita por esse tempo, a rotação volta a 0.
  Rotacao(uint32_t periodoMinimoUs, uint32_t semPulsoUs);

  // Entrega o instante de uma borda. Devolve false se foi descartada como repique.
  bool borda(uint32_t instanteUs);

  struct Janela {
    float rpm = 0;        // média da janela: 60e6 * periodos / soma dos periodos
    float variacao = 0;   // (maior periodo - menor periodo) / periodo medio
    uint32_t bordas = 0;  // bordas aceitas na janela
  };

  // Fecha a janela atual e começa outra. Sem período completo na janela, mas com o último período
  // ainda recente (rotação muito lenta), usa o último período medido.
  Janela fecharJanela(uint32_t agoraUs);

  // Rotação do último período, ou 0 se não houve pulso nos últimos semPulsoUs
  float rpmAtual(uint32_t agoraUs) const;

 private:
  uint32_t periodoMinimo_;
  uint32_t semPulso_;
  bool temBorda_ = false;
  uint32_t ultimaBorda_ = 0;
  uint32_t ultimoPeriodo_ = 0;
  // acumulado da janela
  uint32_t periodos_ = 0;
  uint64_t somaPeriodos_ = 0;
  uint32_t menorPeriodo_ = 0;
  uint32_t maiorPeriodo_ = 0;
  uint32_t bordas_ = 0;
};

}  // namespace ps
