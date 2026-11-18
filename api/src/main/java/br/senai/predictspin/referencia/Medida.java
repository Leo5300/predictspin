package br.senai.predictspin.referencia;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.comum.EnumComValor;

/**
 * Medida de uma janela num ponto. A curtose entra na referência e na explicação, mas não no estado
 * (NORMAL, ATENÇÃO, ALARME); as ordens dependem da rotação e não existem com o torno parado; RMS, pico
 * e velocidade têm piso de ruído (o p95 do T0 do mesmo ponto).
 */
public enum Medida implements EnumComValor {

    RMS_G("rms_g", "RMS", true, false, true),
    PICO_G("pico_g", "pico", true, false, true),
    CURTOSE("curtose", "curtose", false, false, false),
    O1X("o1x", "1X", true, true, false),
    O2X("o2x", "2X", true, true, false),
    O3X("o3x", "3X", true, true, false),
    VEL_RMS_MM_S("vel_rms_mm_s", "velocidade", true, false, true);

    private final String valor;
    private final String rotulo;
    private final boolean entraNoEstado;
    private final boolean ordem;
    private final boolean temPiso;

    Medida(String valor, String rotulo, boolean entraNoEstado, boolean ordem, boolean temPiso) {
        this.valor = valor;
        this.rotulo = rotulo;
        this.entraNoEstado = entraNoEstado;
        this.ordem = ordem;
        this.temPiso = temPiso;
    }

    @Override
    @JsonValue
    public String valor() {
        return valor;
    }

    /** Nome curto para a explicação ("B·RMS"). */
    public String rotulo() {
        return rotulo;
    }

    public boolean entraNoEstado() {
        return entraNoEstado;
    }

    public boolean ordem() {
        return ordem;
    }

    public boolean temPiso() {
        return temPiso;
    }

    @JsonCreator
    public static Medida de(String valor) {
        return EnumComValor.de(Medida.class, valor);
    }
}
