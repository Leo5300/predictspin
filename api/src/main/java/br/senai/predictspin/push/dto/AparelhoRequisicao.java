package br.senai.predictspin.push.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import io.swagger.v3.oas.annotations.media.Schema;

/** Aparelho do usuário que aceitou receber notificação. */
public record AparelhoRequisicao(
        @Schema(description = "Token de push do Expo", example = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")
        @NotNull @Pattern(regexp = "^Expo(nent)?PushToken\\[[^\\]\\s]{1,180}\\]$",
                message = "não é um token de push do Expo") String token,
        @Schema(allowableValues = {"android", "ios"}) @NotNull @Pattern(regexp = "^(android|ios)$",
                message = "use android ou ios") String plataforma) {
}
