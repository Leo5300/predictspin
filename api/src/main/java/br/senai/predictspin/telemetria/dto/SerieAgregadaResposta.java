package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Série agregada de uma máquina: o período dividido em intervalos iguais ("baldes"). Intervalo sem
 * janela volta com {@code janelas = 0} e sem pontos: é uma lacuna, nunca um valor interpolado.
 * Janelas do modo rápido ficam fora.
 */
public record SerieAgregadaResposta(
        Long maquinaId,
        Instant de,
        Instant ate,
        @Nullable Boolean simulado,
        @Schema(description = "Quantidade de intervalos em que o período foi dividido")
        int baldes,
        @Schema(description = "Duração de cada intervalo, em segundos")
        double segundosPorBalde,
        @Schema(description = "Códigos dos pontos que aparecem em algum intervalo")
        List<String> pontos,
        List<Intervalo> intervalos) {

    @Schema(name = "SerieIntervalo")
    public record Intervalo(
            int indice,
            @Schema(description = "Início do intervalo, inclusivo") Instant inicio,
            @Schema(description = "Fim do intervalo, exclusivo") Instant fim,
            @Schema(description = "Janelas normais recebidas no intervalo; 0 = lacuna") long janelas,
            @Schema(description = "Média de rotacao_rpm; nulo na lacuna") @Nullable Double rotacaoMediaRpm,
            @Schema(description = "Alguma janela do intervalo saturou") boolean saturou,
            @Schema(description = "Agregados por código do ponto; vazio na lacuna") Map<String, PontoAgregado> pontos) {
    }

    @Schema(name = "SeriePonto")
    public record PontoAgregado(
            double rmsMediaG,
            double rmsMaxG,
            double picoMaxG,
            double curtoseMedia,
            double o1xMedia,
            double o2xMedia,
            double o3xMedia,
            @Schema(description = "Média da velocidade RMS (mm/s) das janelas que a trouxeram; só aparece se alguma "
                    + "trouxe", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            @JsonInclude(JsonInclude.Include.NON_NULL) Double velRmsMediaMmS,
            @Schema(description = "Maior velocidade RMS (mm/s) no intervalo; só aparece se alguma janela trouxe",
                    requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            @JsonInclude(JsonInclude.Include.NON_NULL) Double velRmsMaxMmS,
            @Schema(description = "Maior z de cada medida no intervalo (rms_g, o1x, o2x, o3x), só das janelas "
                    + "avaliadas contra a referência; só aparece quando alguma foi avaliada",
                    requiredMode = Schema.RequiredMode.NOT_REQUIRED)
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Double> zMax) {
    }
}
