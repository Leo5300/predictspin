package br.senai.predictspin.ia.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Segunda opinião do modelo sobre uma janela: escore de anomalia, classe provável e confiança, com a explicação
 * pronta. É estimativa, não diagnóstico; quem acende atenção e alarme continua sendo a regra.
 */
@Schema(name = "SegundaOpiniao")
public record SegundaOpiniaoResposta(
        long modeloId,
        @Schema(description = "Número da versão do modelo") int versao,
        long janelaId,
        Instant medidoEm,
        @Schema(description = "Escore de anomalia: quanto maior, mais diferente do normal gravado") double escore,
        @Schema(description = "Acima disto, o modelo também vê anomalia (limites.modelo.if_percentil do treino)")
        double limiar,
        @Schema(description = "O escore passou do limiar") boolean anomalia,
        @Schema(description = "Classe mais provável (normal, avanco_excessivo, rotacao_inadequada, "
                + "ferramenta_desgastada, desbalanceamento); nulo sem classificador")
        @Nullable String classe,
        @Schema(description = "Probabilidade da classe mais provável (0 a 1); nulo sem classificador")
        @Nullable Double confianca,
        @Schema(description = "Confiança abaixo de limites.modelo.confianca_min: o painel mostra \"classe incerta\"")
        boolean incerta,
        @Schema(description = "Texto pronto: classe e confiança, as 3 características que mais pesaram e a versão")
        String explicacao,
        @Schema(description = "\"o modelo também vê anomalia\" ou \"o modelo não vê anomalia\"") String concordancia,
        @Schema(description = "Modelo treinado com dado simulado: não é resultado") boolean simulado) {
}
