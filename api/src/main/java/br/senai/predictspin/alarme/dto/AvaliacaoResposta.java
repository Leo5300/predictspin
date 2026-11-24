package br.senai.predictspin.alarme.dto;

import java.time.Instant;
import java.util.List;

import org.springframework.lang.Nullable;

import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alarme.Situacao;
import br.senai.predictspin.referencia.Medida;
import io.swagger.v3.oas.annotations.media.Schema;

/** Avaliação da janela mais recente da máquina contra a referência, ponto a ponto. */
public record AvaliacaoResposta(
        boolean simulado,
        @Nullable Long janelaId,
        @Nullable Instant medidoEm,
        @Nullable Double rotacaoRpm,
        @Schema(description = "Rotação nominal mais próxima da medida; 0 com o torno parado")
        @Nullable Integer marchaRpm,
        @Schema(description = "Pior estado entre os pontos avaliados; nulo quando nenhum ponto foi avaliado")
        @Nullable Nivel estado,
        @Schema(description = "Número da versão da referência usada; nulo sem referência")
        @Nullable Integer referenciaVersao,
        List<PontoAvaliado> pontos,
        @Schema(description = "Até 3 medidas/pontos de maior z, em texto pronto; nulo quando nada está acima do típico")
        @Nullable String explicacao) {

    public record PontoAvaliado(
            @Schema(example = "B") String ponto,
            Situacao situacao,
            @Schema(description = "Estado com atraso e histerese (ISA-18.2); nulo quando não avaliado")
            @Nullable Nivel estado,
            @Schema(description = "Etapa da referência usada (T2 usa a do T1)") @Nullable String etapaRef,
            @Schema(description = "true: comparado com o corte de todas as receitas juntas") boolean generica,
            @Nullable Double zMax,
            @Nullable Medida dominante,
            List<MedidaAvaliada> medidas) {
    }

    public record MedidaAvaliada(
            Medida medida,
            double valor,
            @Schema(description = "Mediana da referência") @Nullable Double tipico,
            @Nullable Double z,
            @Schema(description = "Diferença em % em relação ao típico") @Nullable Double diferencaPct,
            @Schema(description = "σ efetivo da célula da referência usada (nulo sem referência). Com o típico e os "
                    + "limites em z dá a faixa na unidade da medida: típico + z × σ efetivo")
            @Nullable Double sigmaEfetivo) {
    }
}
