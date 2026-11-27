package br.senai.predictspin.demo;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Barra de demonstração (docs/demo.md): a API gera janelas SIMULADAS no ps-sim-01 para a apresentação.
 * Desligada por padrão; ligada só no ambiente da apresentação (PS_DEMO_HABILITADO=true).
 *
 * @param habilitado   liga o gerador e as rotas /api/v1/demo (desligado, as rotas respondem 404)
 * @param janelaS      intervalo entre as janelas geradas, em segundos
 * @param voltaNormalS ATENÇÃO e ALARME voltam sozinhos a NORMAL depois deste tempo (s)
 * @param pararMin     o gerador para sozinho depois deste tempo (min) sem um novo comando
 * @param rotacaoRpm   rotação das janelas geradas; precisa ter referência ativa (T1 e T3) nesta marcha
 * @param dispositivo  dispositivo simulado que "envia" as janelas
 * @param semente      semente da variação natural entre janelas (para o sinal não virar traço reto)
 * @param passoMs      de quanto em quanto tempo o gerador confere se é hora de uma janela
 */
@ConfigurationProperties("ps.demo")
public record PropriedadesDemo(
        @DefaultValue("false") boolean habilitado,
        @DefaultValue("5") int janelaS,
        @DefaultValue("300") int voltaNormalS,
        @DefaultValue("20") int pararMin,
        @DefaultValue("1120") int rotacaoRpm,
        @DefaultValue("ps-sim-01") String dispositivo,
        @DefaultValue("42") long semente,
        @DefaultValue("500") long passoMs) {
}
