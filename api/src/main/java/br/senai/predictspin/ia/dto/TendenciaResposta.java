package br.senai.predictspin.ia.dto;

import java.time.LocalDate;
import java.util.List;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Tendência por ponto (prognóstico, ISO 13374 PA): séries diárias e, quando sobem, em quantos dias cruzariam o
 * limite, sempre com uma faixa. Não é data de quebra.
 */
@Schema(name = "Tendencia")
public record TendenciaResposta(
        @Schema(description = "false: desabilitada por configuração (ps.tendencia.habilitada)") boolean habilitada,
        @Nullable String mensagem,
        boolean simulado,
        int minDias,
        List<PontoTendencia> pontos) {

    @Schema(name = "PontoTendencia")
    public record PontoTendencia(String ponto, List<Serie> series) {
    }

    @Schema(name = "SerieTendencia")
    public record Serie(
            @Schema(description = "severidade (z·s por dia), deriva (mediana do z do RMS no dia) ou temp_cabecote_c")
            String serie,
            String unidade,
            double limite,
            List<Dia> dias,
            @Schema(description = "Nulo com menos de min_dias dias") @Nullable Double inclinacaoPorDia,
            @Nullable Double inclinacaoMinima,
            @Nullable Double inclinacaoMaxima,
            @Schema(description = "Se continuar assim, cruza o limite em pelo menos... dias") @Nullable Double diasMin,
            @Schema(description = "...e no máximo; nulo quando o intervalo de 95% inclui não subir") @Nullable Double diasMax,
            @Schema(description = "Frase pronta (\"se continuar assim, entre X e Y dias\")") String texto) {
    }

    @Schema(name = "DiaTendencia")
    public record Dia(LocalDate dia, double valor) {
    }
}
