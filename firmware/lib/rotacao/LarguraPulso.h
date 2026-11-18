// Largura do pulso do FC-51 (diagnóstico, não vai ao payload). Lógica pura.
//
// A saída do FC-51 vai a 0 enquanto a faixa refletiva passa na frente do sensor: o pulso é o tempo em
// nível baixo, da borda de descida à de subida. Serve para conferir na bancada a hipótese de que, nas
// marchas altas, o pulso fica curto demais para o sensor (que não especifica tempo de resposta).
// A rotação continua vindo só das bordas de descida (Rotacao), como antes.
#pragma once

#include <stdint.h>

namespace ps {

class LarguraPulso {
 public:
  // Uma borda: instante (micros) e o nível do pino depois dela (false = desceu, true = subiu).
  void borda(uint32_t instanteUs, bool nivelDepois);

  struct Janela {
    uint32_t pulsos = 0;    // pulsos completos (descida seguida de subida) que terminaram na janela
    uint32_t minimoUs = 0;  // menor largura; 0 sem pulso
    uint32_t medioUs = 0;   // largura média; 0 sem pulso
  };

  // Fecha a janela e começa outra. Um pulso que começou numa janela e termina na seguinte conta na
  // seguinte.
  Janela fecharJanela();

 private:
  bool emPulso_ = false;
  uint32_t inicio_ = 0;
  uint32_t pulsos_ = 0;
  uint32_t minimo_ = 0;
  uint64_t soma_ = 0;
};

}  // namespace ps
