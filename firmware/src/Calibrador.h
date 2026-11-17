// Calibração de cada sensor pela serial (comandos "cal") e o arquivo /cal.txt no LittleFS.
// O procedimento e as checagens estão em lib/calibracao; aqui ficam a medida, o arquivo e as mensagens.
#pragma once

#include <stddef.h>

namespace calibrador {

// Monta o LittleFS, lê /cal.txt e publica a escala de cada ponto. Chamar no setup(), antes da
// aquisição, para a primeira janela já sair com o ganho calibrado.
void iniciar();

// Trata uma linha "cal ..." da serial (o sinal bruto tem de estar desligado). Bloqueia por cerca de
// 2 s nas medidas de cima e de baixo.
void tratarComando(const char* texto);

// Resumo de uma linha para o comando "estado": "A=A-20261117T143200Z B=nominal C=nominal"
void resumo(char* buf, size_t tamanho);

}  // namespace calibrador
