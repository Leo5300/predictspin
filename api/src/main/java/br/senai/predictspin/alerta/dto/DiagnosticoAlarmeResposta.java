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
                + "foi gravada; o erro está no log)") long falhasAvaliacao,
        @Schema(description = "Janelas gravadas esperando avaliação agora (todas as máquinas)") int avaliacoesNaFila,
        @Schema(description = "Janelas que ficaram sem avaliação porque a fila continuou cheia por "
                + "limites.avaliacao.espera_fila_ms, desde que a API subiu") long avaliacoesDescartadas) {

    @Schema(name = "IndicadoresAlarme", description = "Últimas limites.alarme.indicadores_h horas (24 por padrão), "
            + "sem os alertas de ensaio de condição")
    public record Indicadores(
            @Schema(description = "Média de alertas por hora no período") double alertasPorHora,
            @Schema(description = "Maior número de alertas num intervalo de limites.alarme.rajada_min minutos (o "
                    + "nome do campo vem do padrão, 10 min)") long piorDezMinutos,
            @Schema(description = "Pontos em que o mesmo alerta abriu limites.alarme.repetitivo_vezes vezes ou mais "
                    + "num intervalo de rajada_min minutos")
            List<String> pontosRepetitivos,
            @Schema(description = "Alertas ativos há mais de limites.alarme.parado_h horas") long parados,
            long suprimidos) {
    }

    @Schema(name = "SaudePonto")
    public record Ponto(
            @Schema(example = "B") String ponto,
            @Schema(description = "Severidade acumulada hoje (UTC), em z·s") double severidadeHoje,
            @Schema(description = "Severidade acumulada nos últimos 7 dias, em z·s") double severidadeSemana,
            @Schema(description = "Severidade desde a última OS do ponto (abre OS ao passar do limite)")
            double severidadeDesdeOs,
            @Schema(description = "Diferença % entre o RMS típico das janelas NORMAL de uso do período "
                    + "(z abaixo do limite de atenção; z negativo entra) e o da referência; nulo sem janelas") @Nullable Double derivaPct,
            int derivaJanelas,
            @Schema(description = "Piso de ruído do RMS (p95 do T0), em g; nulo quando não medido")
            @Nullable Double pisoRuidoRms,
            @Schema(description = "Janelas do período com calibração diferente da referência")
            long janelasCalibracaoDiferente) {
    }
}
