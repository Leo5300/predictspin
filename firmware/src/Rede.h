// Rede no núcleo 0: Wi-Fi (até 2 redes), hora por NTP, fila de janelas (RAM + LittleFS) e envio
// HTTPS à API. Também escreve na serial a linha de cada janela.
#pragma once

namespace rede {

// Cria a tarefa da rede, presa ao núcleo 0.
void iniciar();

}  // namespace rede
