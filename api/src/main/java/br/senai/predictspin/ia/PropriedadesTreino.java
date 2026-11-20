package br.senai.predictspin.ia;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Treino (botão Treinar). A chave do serviço de treino vem da variável de ambiente TREINO_CHAVE e nunca sai em
 * resposta nem em log: os números públicos estão em {@link #publicas()}.
 *
 * @param url                   endereço do serviço de treino; vazio = o trabalho fica com o comando do notebook
 * @param chave                 segredo compartilhado com o serviço de treino (cabeçalho X-Treino-Chave)
 * @param esperaAcordarS        quanto a API espera o serviço acordar (o plano gratuito dorme)
 * @param prazoExecucaoMin      trabalho executando há mais que isto vira FALHOU
 * @param usarRetornoOs         o retorno do técnico na OS vira rótulo do próximo treino
 * @param minEnsaiosPorClasse   classe com menos ensaios (grupos) que isto fica fora do classificador
 * @param kMax                  maior número de partes da validação por ensaio
 * @param fuso                  fuso do "dia" da validação por dia
 * @param paginaMax             linhas por página na exportação do conjunto
 */
@ConfigurationProperties("ps.treino")
public record PropriedadesTreino(
        @DefaultValue("") String url,
        @DefaultValue("") String chave,
        @DefaultValue("180") int esperaAcordarS,
        @DefaultValue("30") int prazoExecucaoMin,
        @DefaultValue("true") boolean usarRetornoOs,
        @DefaultValue("2") int minEnsaiosPorClasse,
        @DefaultValue("5") int kMax,
        @DefaultValue("America/Sao_Paulo") String fuso,
        @DefaultValue("1000") int paginaMax) {

    public boolean temServico() {
        return url != null && !url.isBlank();
    }

    public boolean temChave() {
        return chave != null && !chave.isBlank();
    }

    /** O que pode sair na rota de limites (sem a chave e sem o endereço). */
    public Publicas publicas() {
        return new Publicas(temServico(), esperaAcordarS, prazoExecucaoMin, usarRetornoOs, minEnsaiosPorClasse, kMax,
                fuso, paginaMax);
    }

    @io.swagger.v3.oas.annotations.media.Schema(name = "PropriedadesTreino")
    public record Publicas(boolean servicoConfigurado, int esperaAcordarS, int prazoExecucaoMin, boolean usarRetornoOs,
                           int minEnsaiosPorClasse, int kMax, String fuso, int paginaMax) {
    }

    @Override
    public String toString() {
        return "PropriedadesTreino" + publicas();
    }
}
