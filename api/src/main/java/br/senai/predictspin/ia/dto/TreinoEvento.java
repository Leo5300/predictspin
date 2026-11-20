package br.senai.predictspin.ia.dto;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/** Corpos dos eventos "treino" (mudança de estado do trabalho) e "modelo" (versão nova ou ativação) do fluxo ao vivo. */
public final class TreinoEvento {

    private TreinoEvento() {
    }

    @Schema(name = "TreinoEvento", description = "Corpo do evento \"treino\": o trabalho com o estado novo")
    public record Treino(TrabalhoTreinoResposta trabalho) {
    }

    @Schema(name = "ModeloEvento", description = "Corpo do evento \"modelo\": candidato (versão nova) ou ativado")
    public record Modelo(@Schema(allowableValues = {"candidato", "ativado"}) String acao, ModeloResumoResposta modelo,
                         @Schema(description = "Versão que estava ativa e foi arquivada") @Nullable Integer arquivada) {
    }
}
