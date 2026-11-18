package br.senai.predictspin.ordemservico;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Abertura automática de ordem de serviço. PROPOSTA a confirmar com dado real (docs/alarmes.md).
 *
 * @param alarmeContinuoS   alerta de máquina em ALARME por este tempo seguido abre OS
 * @param severidadeLimite  severidade acumulada do ponto (z·s) desde a última OS que abre OS
 */
@ConfigurationProperties("ps.os")
public record PropriedadesOs(
        @DefaultValue("120") double alarmeContinuoS,
        @DefaultValue("600") double severidadeLimite) {
}
