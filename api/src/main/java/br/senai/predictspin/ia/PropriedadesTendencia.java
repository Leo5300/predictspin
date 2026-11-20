package br.senai.predictspin.ia;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Tendência por ponto (prognóstico), pronta e DESABILITADA por padrão. Números são PROPOSTA.
 *
 * @param habilitada            liga as rotas e o cálculo
 * @param minDias               dias com dado exigidos antes de qualquer estimativa
 * @param janelaDias            quantos dias para trás entram na série
 * @param limiteSeveridade      severidade acumulada diária (z·s por dia) considerada o limite
 * @param limiteDerivaPct       deriva diária do RMS (% acima do típico) considerada o limite
 * @param limiteTempCabecoteC   temperatura do cabeçote (°C, média do dia) considerada o limite
 */
@ConfigurationProperties("ps.tendencia")
@Schema(name = "PropriedadesTendencia")
public record PropriedadesTendencia(
        @DefaultValue("false") boolean habilitada,
        @DefaultValue("7") int minDias,
        @DefaultValue("60") int janelaDias,
        @DefaultValue("600") double limiteSeveridade,
        @DefaultValue("30") double limiteDerivaPct,
        @DefaultValue("60") double limiteTempCabecoteC) {
}
