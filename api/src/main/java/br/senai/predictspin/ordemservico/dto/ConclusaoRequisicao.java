package br.senai.predictspin.ordemservico.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.alerta.RetornoTecnico;
import br.senai.predictspin.ordemservico.CondicaoEncontrada;
import io.swagger.v3.oas.annotations.media.Schema;

/** Conclusão da OS com o retorno do técnico. */
public record ConclusaoRequisicao(
        @Schema(example = "rejeitada", description = "confirmada: havia problema; rejeitada: falso positivo")
        @NotNull RetornoTecnico retorno,
        @Schema(example = "Ferramenta conferida, sem desgaste; vibração veio da máquina ao lado")
        @Size(max = 2000) String comentario,
        @Schema(example = "avanco_excessivo", description = "Opcional. O que o técnico encontrou: uma das 5 classes "
                + "(normal, avanco_excessivo, rotacao_inadequada, ferramenta_desgastada, desbalanceamento) ou outra. "
                + "Com confirmada e uma das 5, as janelas do período do alerta entram no próximo treino com ela")
        CondicaoEncontrada condicaoEncontrada) {

    /** Conclusão sem a condição encontrada (contrato anterior à parte B). */
    public ConclusaoRequisicao(RetornoTecnico retorno, String comentario) {
        this(retorno, comentario, null);
    }
}
