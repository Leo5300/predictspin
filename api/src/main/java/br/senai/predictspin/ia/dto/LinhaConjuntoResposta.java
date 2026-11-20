package br.senai.predictspin.ia.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/** Uma janela rotulada do conjunto de treino, com o vetor pronto (ou o motivo de não ter vetor). */
@Schema(name = "LinhaConjunto")
public record LinhaConjuntoResposta(
        long janelaId,
        Instant medidoEm,
        @Schema(description = "Data local da janela (fuso limites.treino.fuso), para a validação por dia")
        LocalDate dia,
        @Schema(description = "Classe: normal, avanco_excessivo, rotacao_inadequada, ferramenta_desgastada ou "
                + "desbalanceamento")
        String rotulo,
        @Schema(description = "ensaio, os_confirmada ou os_rejeitada") String origem,
        @Nullable Long ensaioId,
        @Schema(description = "Grupo da validação: ensaio-ID ou os-ID") String grupo,
        @Schema(description = "Valores na ordem das características do resumo; nulo = ausente. A lista inteira é "
                + "nula quando a janela não gera vetor")
        @Nullable List<Double> valores,
        @Schema(description = "Por que a janela não gerou vetor (evento_marcado, modo_rapido, saturou, "
                + "calibracao_diferente, sem_referencia_completa...); nulo quando gerou")
        @Nullable String motivoExclusao) {
}
