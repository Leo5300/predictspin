package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import br.senai.predictspin.telemetria.ModoJanela;
import io.swagger.v3.oas.annotations.media.Schema;

/** Estado mais recente de uma máquina: os pontos, os canais e a rotação da última janela. */
public record UltimaJanelaResposta(
        Long janelaId,
        String dispositivo,
        boolean simulado,
        Instant medidoEm,
        Instant recebidoEm,
        @Schema(description = "Segundos desde que a janela chegou à API")
        long segundosDesdeRecebimento,
        double rotacaoRpm,
        boolean saturou,
        @Schema(description = "normal (janela de 5 s) ou rapido (janela de 1 s)")
        ModoJanela modo,
        @Schema(description = "Menor número de amostras lidas entre os sensores; nulo se o dispositivo não informou")
        @Nullable Integer amostras,
        @Nullable Integer amostrasEsperadas,
        @Nullable Long ensaioId,
        @Nullable String ensaioCodigo,
        Map<String, Ponto> pontos,
        Map<String, Canal> canais) {

    @Schema(name = "JanelaPonto", description = "Características de vibração de um ponto na janela")
    public record Ponto(Long pontoId, String papel, String descricao, double rmsG, double picoG, double curtose,
                        double o1x, double o2x, double o3x,
                        @Schema(description = "Velocidade RMS em mm/s; só aparece quando o dispositivo mandou",
                                requiredMode = Schema.RequiredMode.NOT_REQUIRED)
                        @JsonInclude(JsonInclude.Include.NON_NULL) Double velRmsMmS,
                        @Schema(description = "Avaliação do ponto contra a referência; só aparece quando a janela "
                                + "foi avaliada (há referência calculada)",
                                requiredMode = Schema.RequiredMode.NOT_REQUIRED)
                        @JsonInclude(JsonInclude.Include.NON_NULL) Avaliacao avaliacao) {

        /** Sem avaliação (janela sem referência). */
        public Ponto(Long pontoId, String papel, String descricao, double rmsG, double picoG, double curtose,
                     double o1x, double o2x, double o3x, Double velRmsMmS) {
            this(pontoId, papel, descricao, rmsG, picoG, curtose, o1x, o2x, o3x, velRmsMmS, null);
        }
    }

    /**
     * Avaliação compacta de um ponto numa janela (o detalhe com típico e % está em GET
     * /maquinas/{id}/avaliacao).
     */
    @Schema(name = "JanelaPontoAvaliacao")
    public record Avaliacao(
            @Schema(description = "avaliada, sem_referencia, sem_referencia_completa, calibracao_diferente ou "
                    + "nao_avaliavel", example = "avaliada") String situacao,
            @Schema(description = "normal, atencao ou alarme (com atraso e histerese); nulo quando não avaliada",
                    example = "normal") @Nullable String estado,
            @Schema(description = "Etapa da referência usada (T0, T1 ou T3)") @Nullable String etapaRef,
            boolean generica,
            @Schema(description = "z de cada medida avaliada, pelo nome da medida (rms_g, o1x...)")
            Map<String, Double> z) {
    }

    @Schema(name = "JanelaCanal", description = "Leitura de um canal auxiliar na janela")
    public record Canal(double valor, String unidade, String grandeza) {
    }
}
