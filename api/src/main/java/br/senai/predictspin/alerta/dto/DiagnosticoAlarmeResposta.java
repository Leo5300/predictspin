package br.senai.predictspin.alerta.dto;

import java.util.List;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/** O que o Diagnóstico mostra da regra de alarme: limites, indicadores e saúde de cada ponto. */
public record DiagnosticoAlarmeResposta(
        boolean simulado,
        LimitesResposta limites,
        Indicadores indicadores,
        @Schema(description = "false: não há T0 gravado; o σ efetivo usa só a fração mínima da mediana")
        boolean pisoRuidoMedido,
        @Schema(description = "Número da versão da referência em uso; nulo sem referência") @Nullable Integer referenciaVersao,
        List<Ponto> pontos,
        @Schema(description = "Avisos prontos (sem piso de ruído, recalcular a referência...)") List<String> avisos,
        @Schema(description = "Janelas que ficaram sem avaliação por erro desde que a API subiu (a janela "
                + "foi gravada; o erro está no log)") long falhasAvaliacao) {

    @Schema(name = "IndicadoresAlarme", description = "Últimas 24 h, sem os alertas de ensaio de condição")
    public record Indicadores(
            @Schema(description = "Média de alertas por hora nas últimas 24 h") double alertasPorHora,
            @Schema(description = "Maior número de alertas numa janela de 10 min") long piorDezMinutos,
            @Schema(description = "Pontos em que o mesmo alerta reabriu 3 vezes ou mais em 10 min")
            List<String> pontosRepetitivos,
            @Schema(description = "Alertas ativos há mais de 24 h") long parados,
            long suprimidos) {
    }

    @Schema(name = "SaudePonto")
    public record Ponto(
            @Schema(example = "B") String ponto,
            @Schema(description = "Severidade acumulada hoje (UTC), em z·s") double severidadeHoje,
            @Schema(description = "Severidade acumulada nos últimos 7 dias, em z·s") double severidadeSemana,
            @Schema(description = "Severidade desde a última OS do ponto (abre OS ao passar do limite)")
            double severidadeDesdeOs,
            @Schema(description = "Diferença % entre o RMS típico das janelas NORMAL de uso das últimas 24 h "
                    + "(|z| abaixo do limite de atenção) e o da referência; nulo sem janelas") @Nullable Double derivaPct,
            int derivaJanelas,
            @Schema(description = "Piso de ruído do RMS (p95 do T0), em g; nulo quando não medido")
            @Nullable Double pisoRuidoRms,
            @Schema(description = "Janelas das últimas 24 h com calibração diferente da referência")
            long janelasCalibracaoDiferente) {
    }
}
