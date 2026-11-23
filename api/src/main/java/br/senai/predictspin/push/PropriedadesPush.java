package br.senai.predictspin.push;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Notificação (push) de alarme pelo serviço de push do Expo. Desligado por padrão; o Render liga por variável
 * de ambiente (PUSH_HABILITADO=true).
 *
 * @param habilitado     envia ou não (registrar aparelho funciona mesmo desligado)
 * @param url            rota de envio do Expo
 * @param tokenAcesso    EXPO_ACCESS_TOKEN, opcional: só vai no cabeçalho quando configurado (segredo)
 * @param timeoutMs      tempo limite de cada chamada ao Expo (conexão e resposta)
 * @param intervaloMin   no máximo um push por ponto e tipo (alarme, os, instrumento) neste intervalo
 * @param filaMax        envios esperando a thread do push; cheia, o envio é descartado (contado)
 * @param lote           mensagens por chamada (o Expo aceita até 100)
 * @param maxAparelhos   aparelhos ativos por usuário; o mais antigo sai quando passa disso
 */
@ConfigurationProperties("ps.push")
public record PropriedadesPush(
        @DefaultValue("false") boolean habilitado,
        @DefaultValue("https://exp.host/--/api/v2/push/send") String url,
        @DefaultValue("") String tokenAcesso,
        @DefaultValue("5000") int timeoutMs,
        @DefaultValue("15") int intervaloMin,
        @DefaultValue("200") int filaMax,
        @DefaultValue("100") int lote,
        @DefaultValue("10") int maxAparelhos) {
}
