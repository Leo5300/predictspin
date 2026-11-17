// Aquisição no núcleo 1: lê os três ADXL345 no mesmo tick, a rotação e calcula as características
// em fluxo. Nunca espera a rede: a janela pronta vai para uma fila do FreeRTOS sem bloqueio.
#pragma once

#include "Calibracao.h"

namespace aquisicao {

// Detecta os sensores, roda o autoteste, configura a FIFO e a interrupção da rotação.
// Chamar no setup() (núcleo 1), depois de Serial.begin.
void iniciar();

// Um tick: espera ativa até o instante previsto, esvazia as FIFO e fecha a janela quando é hora.
void passo();

// Medida para a calibração (chamadas do núcleo 0): o núcleo 1 junta média e desvio do eixo de
// análise do ponto, em LSB brutos, até `amostras`. false se o sensor não está presente ou se já há
// uma medida em andamento.
bool pedirMedidaCal(int ponto, uint32_t amostras);
// true quando a medida pedida terminou; copia o resultado.
bool medidaCalPronta(ps::MediaDesvio* resultado);
// Desiste da medida em andamento (tempo esgotado).
void cancelarMedidaCal();

}  // namespace aquisicao
