// Aquisição no núcleo 1: lê os três ADXL345 no mesmo tick, a rotação e calcula as características
// em fluxo. Nunca espera a rede: a janela pronta vai para uma fila do FreeRTOS sem bloqueio.
#pragma once

namespace aquisicao {

// Detecta os sensores, roda o autoteste, configura a FIFO e a interrupção da rotação.
// Chamar no setup() (núcleo 1), depois de Serial.begin.
void iniciar();

// Um tick: espera ativa até o instante previsto, esvazia as FIFO e fecha a janela quando é hora.
void passo();

}  // namespace aquisicao
