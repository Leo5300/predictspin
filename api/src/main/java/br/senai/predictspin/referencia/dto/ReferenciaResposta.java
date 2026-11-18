package br.senai.predictspin.referencia.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** Referência em uso de uma máquina e tipo de dado: versão, células e cobertura por marcha e etapa. */
public record ReferenciaResposta(
        boolean simulado,
        @Schema(description = "Nula quando a referência nunca foi calculada") VersaoReferenciaResposta versao,
        @Schema(description = "false: não há T0 gravado; o σ efetivo usa só a fração mínima da mediana")
        boolean pisoRuidoMedido,
        List<CelulaReferenciaResposta> celulas,
        List<Cobertura> cobertura) {

    /**
     * Situação de uma marcha e etapa (pelo RMS de todos os pontos): com = todos com célula suficiente;
     * insuficiente = há janelas, mas não bastam; sem = nenhuma janela.
     */
    public record Cobertura(
            int marchaRpm,
            @Schema(example = "T1") String etapa,
            @Schema(allowableValues = {"com", "insuficiente", "sem"}) String situacao) {
    }
}
