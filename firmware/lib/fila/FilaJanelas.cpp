#include "FilaJanelas.h"

namespace ps {

FilaJanelas::FilaJanelas(ArmazenamentoLotes* armazenamento, uint16_t maxLotes)
    : armazenamento_(armazenamento), maxLotes_(maxLotes ? maxLotes : 1) {}

void FilaJanelas::iniciar() {
  uint32_t primeiro, ultimo;
  if (armazenamento_ && armazenamento_->limites(&primeiro, &ultimo)) {
    temLotes_ = true;
    primeiroLote_ = primeiro;
    proximoLote_ = ultimo + 1;
    janelasEmLotes_ = (proximoLote_ - primeiroLote_) * TAMANHO_LOTE;
  }
}

uint16_t FilaJanelas::lotes() const {
  return temLotes_ ? (uint16_t)(proximoLote_ - primeiroLote_) : 0;
}

uint32_t FilaJanelas::tamanho() const {
  uint32_t emLotes = janelasEmLotes_;
  if (enviandoLote_) emLotes += (uint32_t)(quantidadeEnvio_ - posicaoEnvio_);
  return emLotes + quantidadeRam_;
}

void FilaJanelas::colocar(const DadosJanela& j) {
  if (quantidadeRam_ == CAPACIDADE_RAM) {
    despejarRamEmLote();
  }
  if (quantidadeRam_ == CAPACIDADE_RAM) {
    // sem armazenamento: perde a mais antiga da RAM para guardar a nova
    inicioRam_ = (uint16_t)((inicioRam_ + 1) % CAPACIDADE_RAM);
    quantidadeRam_--;
    perdidas_++;
  }
  ram_[(inicioRam_ + quantidadeRam_) % CAPACIDADE_RAM] = j;
  quantidadeRam_++;
}

void FilaJanelas::despejarRamEmLote() {
  if (!armazenamento_) return;
  if (lotes() >= maxLotes_) {
    // armazenamento cheio: descarta o lote mais antigo que não está em envio
    uint32_t vitima = primeiroLote_;
    if (enviandoLote_ && vitima == loteEmEnvio_) {
      // o lote em envio já está na RAM; só some do armazenamento depois de enviado
      vitima = primeiroLote_ + 1;
    }
    if (vitima < proximoLote_) {
      armazenamento_->apagar(vitima);
      perdidas_ += TAMANHO_LOTE;
      janelasEmLotes_ = janelasEmLotes_ >= TAMANHO_LOTE ? janelasEmLotes_ - TAMANHO_LOTE : 0;
      if (vitima == primeiroLote_) {
        primeiroLote_++;
      } else {
        // lote do meio: o envio pula o buraco ao avançar (ler() devolve 0)
      }
    }
  }
  DadosJanela lote[TAMANHO_LOTE];
  for (uint16_t i = 0; i < TAMANHO_LOTE; i++) {
    lote[i] = ram_[(inicioRam_ + i) % CAPACIDADE_RAM];
  }
  uint32_t seq = temLotes_ ? proximoLote_ : 0;
  if (!armazenamento_->gravar(seq, lote, TAMANHO_LOTE)) {
    return;  // falha de gravação: as janelas continuam na RAM
  }
  if (!temLotes_) {
    temLotes_ = true;
    primeiroLote_ = seq;
  }
  proximoLote_ = seq + 1;
  janelasEmLotes_ += TAMANHO_LOTE;
  inicioRam_ = (uint16_t)((inicioRam_ + TAMANHO_LOTE) % CAPACIDADE_RAM);
  quantidadeRam_ = (uint16_t)(quantidadeRam_ - TAMANHO_LOTE);
}

bool FilaJanelas::carregarLoteMaisAntigo() {
  while (temLotes_ && primeiroLote_ < proximoLote_) {
    uint32_t seq = primeiroLote_;
    uint16_t n = armazenamento_->ler(seq, envio_, TAMANHO_LOTE);
    janelasEmLotes_ = janelasEmLotes_ >= TAMANHO_LOTE ? janelasEmLotes_ - TAMANHO_LOTE : 0;
    if (n > 0) {
      enviandoLote_ = true;
      loteEmEnvio_ = seq;
      quantidadeEnvio_ = n;
      posicaoEnvio_ = 0;
      return true;
    }
    // lote ausente ou corrompido: descarta e tenta o seguinte
    armazenamento_->apagar(seq);
    primeiroLote_++;
  }
  if (temLotes_ && primeiroLote_ >= proximoLote_) {
    temLotes_ = false;
    janelasEmLotes_ = 0;
  }
  return false;
}

bool FilaJanelas::frente(DadosJanela* j) {
  if (!enviandoLote_) {
    carregarLoteMaisAntigo();
  }
  if (enviandoLote_) {
    *j = envio_[posicaoEnvio_];
    return true;
  }
  if (quantidadeRam_ == 0) return false;
  *j = ram_[inicioRam_];
  return true;
}

void FilaJanelas::removerFrente() {
  if (enviandoLote_) {
    posicaoEnvio_++;
    if (posicaoEnvio_ >= quantidadeEnvio_) {
      armazenamento_->apagar(loteEmEnvio_);
      enviandoLote_ = false;
      if (primeiroLote_ == loteEmEnvio_) primeiroLote_++;
      if (primeiroLote_ >= proximoLote_) {
        temLotes_ = false;
        janelasEmLotes_ = 0;
      }
    }
    return;
  }
  if (quantidadeRam_ == 0) return;
  inicioRam_ = (uint16_t)((inicioRam_ + 1) % CAPACIDADE_RAM);
  quantidadeRam_--;
}

}  // namespace ps
