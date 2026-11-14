package br.senai.predictspin.catalogo.dto;

import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** Renomear e trocar a descrição; campo ausente (nulo) não muda; descrição vazia apaga. */
public record AlteracaoItemCatalogoRequisicao(
        @Schema(example = "Aço SAE 1045") @Size(min = 1, max = 80) String nome,
        @Size(max = 200) String descricao) {
}
