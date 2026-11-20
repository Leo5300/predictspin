package br.senai.predictspin.ia.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/** Trabalho de treino criado pelo botão Treinar. */
@Schema(name = "TrabalhoTreino")
public record TrabalhoTreinoResposta(
        long id,
        long maquinaId,
        boolean simulado,
        @Schema(description = "pendente, acordando, executando, concluido ou falhou",
                allowableValues = {"pendente", "acordando", "executando", "concluido", "falhou"})
        String estado,
        @Schema(description = "O que está acontecendo, pronto para a tela (\"acordando o serviço de treino\", erro...)")
        @Nullable String mensagem,
        @Schema(description = "Sem serviço de treino configurado: o comando que faz o mesmo no notebook")
        @Nullable String comando,
        Instant criadoEm,
        @Nullable String criadoPor,
        @Nullable Instant iniciadoEm,
        @Nullable Instant concluidoEm,
        @Schema(description = "Versão criada (como candidata) quando o trabalho conclui") @Nullable Long modeloId,
        @Nullable Integer modeloVersao) {
}
