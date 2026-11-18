package br.senai.predictspin.referencia;

import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/**
 * Por que uma janela ficou fora da referência. Os seis primeiros são do filtro de qualidade (janela
 * "ruim", que a parte B também descarta no treino); os outros são da seleção para a referência.
 */
public enum MotivoExclusao implements EnumComValor {

    SATUROU("saturou"),
    MODO_RAPIDO("modo_rapido"),
    AMOSTRAS_FALTANDO("amostras_faltando"),
    FORA_DA_MARCHA("fora_da_marcha"),
    ORDENS_ZERADAS("ordens_zeradas"),
    ENSAIO_DESCARTADO("ensaio_descartado"),
    /** Ensaio com condição diferente de "normal" (inclui sensor_solto). */
    CONDICAO_NAO_NORMAL("condicao_nao_normal"),
    /** T2 não tem referência própria: é avaliado contra o T1 da mesma marcha. */
    ETAPA_T2("etapa_t2"),
    /** Ponto com calibração diferente da mais recente: os valores em g não são comparáveis. */
    CALIBRACAO_ANTIGA("calibracao_antiga");

    private final String valor;

    MotivoExclusao(String valor) {
        this.valor = valor;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    /** Motivo do filtro de qualidade (vale também para o treino da parte B). */
    public boolean doFiltro() {
        return ordinal() <= ENSAIO_DESCARTADO.ordinal();
    }
}
