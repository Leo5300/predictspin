package br.senai.predictspin.seguranca.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequisicao(
        @NotBlank @Size(max = 160) String email,
        @NotBlank @Size(max = 72) String senha) {
}
