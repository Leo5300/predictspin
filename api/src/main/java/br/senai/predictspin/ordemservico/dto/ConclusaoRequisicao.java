package br.senai.predictspin.ordemservico.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import br.senai.predictspin.alerta.RetornoTecnico;
import io.swagger.v3.oas.annotations.media.Schema;

/** Conclusão da OS com o retorno do técnico. */
public record ConclusaoRequisicao(
        @Schema(example = "rejeitada", description = "confirmada: havia problema; rejeitada: falso positivo")
        @NotNull RetornoTecnico retorno,
        @Schema(example = "Ferramenta conferida, sem desgaste; vibração veio da máquina ao lado")
        @Size(max = 2000) String comentario) {
}
