package br.senai.predictspin.alarme;

import java.time.Duration;
import java.time.Instant;

/**
 * Regra ISA-18.2 de um ponto, janela a janela (sem banco). Tempos medidos pelo medido_em das janelas:
 * uma condição que começou na janela t0 e continua na janela t já durou (t − t0) + duração da janela.
 * <ul>
 *   <li>Atraso: só entra em ATENÇÃO (ou ALARME) depois de {@code atrasoS} seguidos com z ≥ limite.</li>
 *   <li>Histerese: só sai quando z fica abaixo de limite − {@code histereseZ} por {@code saidaS}; de
 *       ALARME desce para ATENÇÃO se z ainda está na faixa de ATENÇÃO (com a histerese), senão para NORMAL.</li>
 *   <li>Janela sem avaliação (z nulo) conta como "fora do desvio": não sobe e ajuda a sair.</li>
 *   <li>Intervalo grande sem janelas zera os temporizadores (o estado continua).</li>
 * </ul>
 */
public final class MaquinaDeEstados {

    private MaquinaDeEstados() {
    }

    /** Mudança de estado do ponto nesta janela (anterior igual ao novo = sem mudança). */
    public record Transicao(Nivel anterior, Nivel novo) {
        public boolean mudou() {
            return anterior != novo;
        }
    }

    public static Transicao passo(EstadoPonto e, Instant t, double duracaoS, Double z, PropriedadesAlarme p) {
        zerarSeHouveLacuna(e, t, duracaoS, p);
        Nivel anterior = e.estado;
        double valor = z == null ? Double.NEGATIVE_INFINITY : z;
        e.atencaoDesde = valor >= p.zAtencao() ? desde(e.atencaoDesde, t) : null;
        e.alarmeDesde = valor >= p.zAlarme() ? desde(e.alarmeDesde, t) : null;

        Nivel alvo = e.estado;
        if (durou(e.alarmeDesde, t, duracaoS, p.atrasoS())) {
            alvo = Nivel.ALARME;
        } else if (durou(e.atencaoDesde, t, duracaoS, p.atrasoS())) {
            alvo = Nivel.pior(Nivel.ATENCAO, e.estado);
        }
        if (alvo.acimaDe(e.estado)) {
            e.estado = alvo;
            e.abaixoDesde = null;
        } else if (e.estado != Nivel.NORMAL) {
            descer(e, t, duracaoS, valor, p);
        }
        if (e.estado == Nivel.ALARME) {
            e.emAlarmeDesde = desde(e.emAlarmeDesde, t);
        } else {
            e.emAlarmeDesde = null;
        }
        return new Transicao(anterior, e.estado);
    }

    private static void descer(EstadoPonto e, Instant t, double duracaoS, double z, PropriedadesAlarme p) {
        if (z >= p.limite(e.estado) - p.histereseZ()) {
            e.abaixoDesde = null;
            return;
        }
        e.abaixoDesde = desde(e.abaixoDesde, t);
        if (durou(e.abaixoDesde, t, duracaoS, p.saidaS())) {
            e.estado = e.estado == Nivel.ALARME && z >= p.zAtencao() - p.histereseZ() ? Nivel.ATENCAO : Nivel.NORMAL;
            e.abaixoDesde = null;
        }
    }

    /**
     * Sem janela por mais que o atraso, a saída e duas janelas: as condições "seguidas" foram
     * interrompidas, então os temporizadores recomeçam.
     */
    static void zerarSeHouveLacuna(EstadoPonto e, Instant t, double duracaoS, PropriedadesAlarme p) {
        if (e.ultimoMedidoEm == null) {
            return;
        }
        double lacunaMaxima = Math.max(p.atrasoS(), p.saidaS()) + 2 * duracaoS;
        if (segundos(e.ultimoMedidoEm, t) > lacunaMaxima) {
            e.atencaoDesde = null;
            e.alarmeDesde = null;
            e.abaixoDesde = null;
            e.ausenteDesde = null;
            e.sinalBaixoDesde = null;
            e.instrumentoOkDesde = null;
        }
    }

    static Instant desde(Instant atual, Instant t) {
        return atual == null ? t : atual;
    }

    static boolean durou(Instant desde, Instant t, double duracaoS, double limiteS) {
        return desde != null && segundos(desde, t) + duracaoS >= limiteS - 1e-9;
    }

    static double segundos(Instant de, Instant ate) {
        return Duration.between(de, ate).toNanos() / 1e9;
    }

    // ------------------------------------------------------------------ instrumento

    /** Condições de instrumento vistas nesta janela, para um ponto. */
    /**
     * @param falhaIdentificada o envio disse qual sensor saturou ou perdeu amostras; false quando a falha veio só
     *                          da janela inteira e o ponto foi escolhido pelo maior pico
     */
    public record CondicaoInstrumento(boolean ausente, boolean sinalBaixo, boolean falhaAmostragem,
                                      boolean falhaIdentificada) {

        public CondicaoInstrumento(boolean ausente, boolean sinalBaixo, boolean falhaAmostragem) {
            this(ausente, sinalBaixo, falhaAmostragem, true);
        }
    }

    /** Resultado do passo de instrumento: abriu (com o motivo), normalizou ou nada. */
    public record PassoInstrumento(boolean abriu, boolean normalizou, String motivo) {
        static final PassoInstrumento NADA = new PassoInstrumento(false, false, null);
    }

    /**
     * Alerta de instrumento (sensor solto, caído ou com defeito), diferente do alerta de máquina. Abre
     * quando o ponto some do envio por {@code instrumentoS}, quando o sinal some por {@code instrumentoS}
     * (ver {@link CondicaoInstrumento#sinalBaixo()}) ou quando a saturação ou a falta de amostras se
     * repete em {@code instrumentoS}. Normaliza depois de {@code saidaS} sem nenhuma das condições.
     */
    public static PassoInstrumento passoInstrumento(EstadoPonto e, Instant t, double duracaoS, CondicaoInstrumento c,
                                                    PropriedadesAlarme p) {
        e.ausenteDesde = c.ausente() ? desde(e.ausenteDesde, t) : null;
        e.sinalBaixoDesde = c.sinalBaixo() ? desde(e.sinalBaixoDesde, t) : null;
        boolean repetida = false;
        if (c.falhaAmostragem()) {
            repetida = e.falhaAmostragemEm != null && segundos(e.falhaAmostragemEm, t) <= p.instrumentoS();
            e.falhaAmostragemEm = t;
        }
        String motivo = null;
        if (durou(e.ausenteDesde, t, duracaoS, p.instrumentoS())) {
            motivo = "o sensor sumiu do envio enquanto os outros pontos continuaram chegando";
        } else if (durou(e.sinalBaixoDesde, t, duracaoS, p.instrumentoS())) {
            motivo = "o sinal sumiu: RMS e 1X abaixo da metade do típico, com o torno girando e os outros pontos normais";
        } else if (repetida) {
            motivo = c.falhaIdentificada() ? "saturação ou amostras faltando repetidas neste sensor"
                    : "saturação ou amostras faltando repetidas; o envio não diz qual sensor, ficou o de maior pico";
        }
        if (motivo != null) {
            e.instrumentoOkDesde = null;
            if (!e.instrumentoAtivo) {
                e.instrumentoAtivo = true;
                return new PassoInstrumento(true, false, motivo);
            }
            return PassoInstrumento.NADA;
        }
        if (!e.instrumentoAtivo) {
            return PassoInstrumento.NADA;
        }
        e.instrumentoOkDesde = desde(e.instrumentoOkDesde, t);
        if (durou(e.instrumentoOkDesde, t, duracaoS, p.saidaS())) {
            e.instrumentoAtivo = false;
            e.instrumentoOkDesde = null;
            return new PassoInstrumento(false, true, null);
        }
        return PassoInstrumento.NADA;
    }
}
