package br.senai.predictspin.push.dto;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

/** Aparelho registrado (o token não volta na resposta). */
public record AparelhoResposta(
        Long id,
        @Schema(allowableValues = {"android", "ios"}) String plataforma,
        boolean ativo,
        Instant criadoEm,
        Instant ultimoUsoEm,
        @Schema(description = "false: a API guarda o aparelho, mas o envio de push está desligado (ps.push.habilitado)")
        boolean envioHabilitado) {
}
