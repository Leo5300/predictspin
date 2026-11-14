package br.senai.predictspin.catalogo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

public record NovoItemCatalogoRequisicao(
        @Schema(example = "Aço SAE 1045") @NotBlank @Size(max = 80) String nome,
        @Schema(example = "bit de metal duro, ângulo 60°") @Size(max = 200) String descricao) {
}
