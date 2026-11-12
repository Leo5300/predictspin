package br.senai.predictspin.eventos;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Limites do fluxo de eventos ao vivo (SSE). Os padrões são pensados para a instância pequena de
 * produção (0,1 CPU e 512 MB): cada conexão custa uma thread de envio e uma fila.
 */
@ConfigurationProperties("predictspin.eventos")
public record PropriedadesEventos(
        @DefaultValue("4") int maxPorUsuario,
        @DefaultValue("20") int maxTotal,
        @DefaultValue("15s") Duration batimento,
        @DefaultValue("64") int filaPorAssinante,
        @DefaultValue("30m") Duration duracaoMaxima) {
}
