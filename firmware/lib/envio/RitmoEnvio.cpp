#include "RitmoEnvio.h"

namespace ps {

RitmoEnvio::RitmoEnvio(uint32_t intervaloMinimoMs, uint64_t idadeRecuperacaoUs)
    : intervaloMinimo_(intervaloMinimoMs), idadeRecuperacao_(idadeRecuperacaoUs) {}

bool RitmoEnvio::podeEnviar(uint32_t agoraMs) const {
  return (int32_t)(agoraMs - proxima_) >= 0;  // aritmética sem sinal atravessa o estouro do millis()
}

uint32_t RitmoEnvio::esperaMs(uint32_t agoraMs) const {
  return podeEnviar(agoraMs) ? 0 : proxima_ - agoraMs;
}

void RitmoEnvio::registrar(Decisao decisao, uint32_t agoraMs, bool temFrente, uint64_t idadeFrenteUs) {
  switch (decisao) {
    case Decisao::REENVIAR:
      falhas_++;
      proxima_ = agoraMs + esperaReenvioMs(falhas_);  // a espera de erro prevalece
      return;
    case Decisao::CHAVE_INVALIDA:
      return;  // quem chama para de enviar
    case Decisao::SUCESSO:
    case Decisao::DESCARTAR:
      falhas_ = 0;
      recuperando_ = temFrente && idadeFrenteUs > idadeRecuperacao_;
      proxima_ = recuperando_ ? agoraMs + intervaloMinimo_ : agoraMs;
      return;
  }
}

}  // namespace ps
