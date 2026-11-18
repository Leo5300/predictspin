// Ritmo de envio da fila: quando a próxima janela pode sair. Lógica pura.
//
// - Rede normal: a próxima sai logo depois da resposta.
// - Recuperação (a janela da frente da fila tem mais de `idadeRecuperacaoUs`, por exemplo depois de
//   uma queda de rede): espera pelo menos `intervaloMinimoMs` entre uma resposta e o próximo envio,
//   para não despejar milhares de janelas de uma vez na API e nos painéis abertos. A ordem continua
//   a da fila (cronológica).
// - Erro que pede reenvio (5xx, tempo esgotado, falha de conexão): a espera crescente de
//   esperaReenvioMs vale e prevalece sobre o intervalo mínimo.
#pragma once

#include <stdint.h>

#include "Protocolo.h"

namespace ps {

class RitmoEnvio {
 public:
  RitmoEnvio(uint32_t intervaloMinimoMs, uint64_t idadeRecuperacaoUs);

  // A próxima janela já pode sair?
  bool podeEnviar(uint32_t agoraMs) const;

  // Depois de cada resposta. temFrente: ainda há janela na fila; idadeFrenteUs: agora (UTC) menos o
  // início dessa janela.
  void registrar(Decisao decisao, uint32_t agoraMs, bool temFrente, uint64_t idadeFrenteUs);

  uint32_t falhas() const { return falhas_; }
  // A última resposta pôs o intervalo mínimo (fila em recuperação)
  bool recuperando() const { return recuperando_; }
  // Quanto falta para poder enviar (0 se já pode)
  uint32_t esperaMs(uint32_t agoraMs) const;

 private:
  uint32_t intervaloMinimo_;
  uint64_t idadeRecuperacao_;
  uint32_t proxima_ = 0;
  uint32_t falhas_ = 0;
  bool recuperando_ = false;
};

}  // namespace ps
