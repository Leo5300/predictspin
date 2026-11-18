package br.senai.predictspin.referencia;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Parâmetros da referência e do filtro de qualidade. Todos são PROPOSTA a confirmar com dado real
 * (docs/alarmes.md); a rota de limites os serve ao painel, que nunca os escreve à mão.
 *
 * @param minJanelas         célula com menos janelas que isto fica "insuficiente" e não gera z
 * @param sigmaMinFracao     piso do σ efetivo como fração da mediana
 * @param toleranciaMarcha   rotação fora de ±esta fração da marcha mais próxima torna a janela ruim
 * @param amostrasMinFracao  janela com menos que esta fração das amostras esperadas é ruim
 * @param deriva             janelas de uso normal que entram no recálculo
 */
@ConfigurationProperties("ps.referencia")
public record PropriedadesReferencia(
        @DefaultValue("24") int minJanelas,
        @DefaultValue("0.05") double sigmaMinFracao,
        @DefaultValue("0.10") double toleranciaMarcha,
        @DefaultValue("0.98") double amostrasMinFracao,
        @DefaultValue Deriva deriva) {

    /**
     * @param habilitada   liga a entrada de janelas de uso no recálculo
     * @param dias         só as dos últimos dias
     * @param fracaoMaxima no máximo esta fração das janelas de cada célula
     */
    public record Deriva(
            @DefaultValue("true") boolean habilitada,
            @DefaultValue("7") int dias,
            @DefaultValue("0.30") double fracaoMaxima) {
    }
}
