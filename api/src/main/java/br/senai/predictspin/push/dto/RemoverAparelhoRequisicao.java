package br.senai.predictspin.push.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/** Aparelho a remover (ao sair do app). */
public record RemoverAparelhoRequisicao(
        @Schema(description = "Token de push do Expo") @NotBlank @Size(max = 200) String token) {
}
