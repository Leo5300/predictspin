// Fila de janelas a enviar: memória RAM para o uso normal e lotes em arquivo (LittleFS) quando a
// rede cai. As janelas saem sempre na ordem em que entraram. Lógica pura: o armazenamento é uma
// interface, implementada com LittleFS no ESP32 e em memória nos testes.
//
// Ordem global = lotes em arquivo (mais antigos) seguidos da RAM (mais novas). Quando a RAM enche,
// as mais antigas da RAM viram um lote novo no fim dos arquivos, o que preserva a ordem.
// Um lote é enviado inteiro a partir de uma cópia em RAM e o arquivo só é apagado quando a última
// janela dele sai. Se o ESP32 reiniciar no meio, o lote é reenviado desde o começo: a API não
// duplica (mesmo medido_em responde 200).
#pragma once

#include <stdint.h>

#include "Protocolo.h"

namespace ps {

class ArmazenamentoLotes {
 public:
  virtual ~ArmazenamentoLotes() {}
  // Grava um lote novo com número de sequência seq. false se não deu para gravar.
  virtual bool gravar(uint32_t seq, const DadosJanela* janelas, uint16_t n) = 0;
  // Lê o lote seq para `destino` (até max). Devolve quantas leu (0 se não existe ou está corrompido).
  virtual uint16_t ler(uint32_t seq, DadosJanela* destino, uint16_t max) = 0;
  virtual void apagar(uint32_t seq) = 0;
  // Menor e maior sequência existentes; false se não há lote.
  virtual bool limites(uint32_t* primeiro, uint32_t* ultimo) = 0;
};

class FilaJanelas {
 public:
  static const uint16_t CAPACIDADE_RAM = 64;
  static const uint16_t TAMANHO_LOTE = 32;

  // maxLotes: quantos lotes cabem no armazenamento; cheio, o lote mais antigo é descartado.
  FilaJanelas(ArmazenamentoLotes* armazenamento, uint16_t maxLotes);

  // Recupera os lotes deixados no armazenamento (depois de um reinício).
  void iniciar();

  // Põe uma janela no fim da fila.
  void colocar(const DadosJanela& j);

  // Próxima janela a enviar; false se a fila está vazia.
  bool frente(DadosJanela* j);
  // Tira a janela que frente() devolveu.
  void removerFrente();

  uint32_t tamanho() const;
  uint16_t naRam() const { return quantidadeRam_; }
  uint16_t lotes() const;
  uint32_t perdidas() const { return perdidas_; }  // descartadas por falta de espaço
  uint32_t capacidade() const { return (uint32_t)maxLotes_ * TAMANHO_LOTE + CAPACIDADE_RAM; }

 private:
  void despejarRamEmLote();
  bool carregarLoteMaisAntigo();

  ArmazenamentoLotes* armazenamento_;
  uint16_t maxLotes_;

  DadosJanela ram_[CAPACIDADE_RAM];
  uint16_t inicioRam_ = 0;
  uint16_t quantidadeRam_ = 0;

  // lotes no armazenamento: [primeiroLote_, proximoLote_)
  bool temLotes_ = false;
  uint32_t primeiroLote_ = 0;
  uint32_t proximoLote_ = 0;
  uint32_t janelasEmLotes_ = 0;  // estimativa: lotes cheios, exceto o carregado

  // lote em envio, copiado para a RAM
  DadosJanela envio_[TAMANHO_LOTE];
  uint16_t quantidadeEnvio_ = 0;
  uint16_t posicaoEnvio_ = 0;
  bool enviandoLote_ = false;
  uint32_t loteEmEnvio_ = 0;

  uint32_t perdidas_ = 0;
};

}  // namespace ps
