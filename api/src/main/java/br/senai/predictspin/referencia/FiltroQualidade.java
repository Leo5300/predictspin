package br.senai.predictspin.referencia;

import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import br.senai.predictspin.telemetria.ModoJanela;

/**
 * Filtro de qualidade das janelas: ÚNICA definição de janela "ruim", usada na referência, na avaliação
 * e (parte B) no treino. Uma janela é ruim quando:
 * <ul>
 *   <li>saturou;</li>
 *   <li>é do modo rápido (janela de 1 s, estatística diferente da de 5 s);</li>
 *   <li>tem menos que {@code amostrasMinFracao} das amostras esperadas;</li>
 *   <li>a rotação é maior que 0 e está fora de ±{@code toleranciaMarcha} da marcha mais próxima;</li>
 *   <li>tem ordens 1X, 2X e 3X iguais a 0 num ponto com rotação maior que 0 (primeira janela depois de
 *       ligar ou trocar de marcha);</li>
 *   <li>pertence a um ensaio descartado.</li>
 * </ul>
 */
public final class FiltroQualidade {

    private FiltroQualidade() {
    }

    /** O que o filtro precisa saber da janela. Amostras e esperadas são opcionais (firmware antigo). */
    public record Entrada(boolean saturou, ModoJanela modo, Integer amostras, Integer amostrasEsperadas,
                          double rotacaoRpm, boolean ordensZeradas, boolean ensaioDescartado) {
    }

    /** Motivos pelos quais a janela é ruim; vazio = janela boa. */
    public static Set<MotivoExclusao> motivos(Entrada janela, List<Integer> marchas, PropriedadesReferencia p) {
        EnumSet<MotivoExclusao> motivos = EnumSet.noneOf(MotivoExclusao.class);
        if (janela.saturou()) {
            motivos.add(MotivoExclusao.SATUROU);
        }
        if (janela.modo() == ModoJanela.RAPIDO) {
            motivos.add(MotivoExclusao.MODO_RAPIDO);
        }
        if (amostrasFaltando(janela.amostras(), janela.amostrasEsperadas(), p.amostrasMinFracao())) {
            motivos.add(MotivoExclusao.AMOSTRAS_FALTANDO);
        }
        if (foraDaMarcha(janela.rotacaoRpm(), marchas, p.toleranciaMarcha())) {
            motivos.add(MotivoExclusao.FORA_DA_MARCHA);
        }
        if (janela.ordensZeradas() && janela.rotacaoRpm() > 0) {
            motivos.add(MotivoExclusao.ORDENS_ZERADAS);
        }
        if (janela.ensaioDescartado()) {
            motivos.add(MotivoExclusao.ENSAIO_DESCARTADO);
        }
        return Collections.unmodifiableSet(motivos);
    }

    public static boolean amostrasFaltando(Integer amostras, Integer esperadas, double fracaoMinima) {
        return amostras != null && esperadas != null && esperadas > 0 && amostras < fracaoMinima * esperadas;
    }

    /** Rotação maior que 0 fora da tolerância da marcha mais próxima (sem marchas cadastradas, nunca). */
    public static boolean foraDaMarcha(double rotacaoRpm, List<Integer> marchas, double tolerancia) {
        if (rotacaoRpm <= 0 || marchas.isEmpty()) {
            return false;
        }
        int marcha = marcha(rotacaoRpm, marchas);
        return Math.abs(rotacaoRpm - marcha) > tolerancia * marcha;
    }

    /**
     * Marcha da janela: 0 com o torno parado; senão a rotação nominal mais próxima da medida (empate: a
     * menor). Máquina sem rotações nominais cadastradas usa a própria rotação arredondada.
     */
    public static int marcha(double rotacaoRpm, List<Integer> marchas) {
        if (rotacaoRpm <= 0) {
            return 0;
        }
        if (marchas.isEmpty()) {
            return (int) Math.round(rotacaoRpm);
        }
        int melhor = marchas.get(0);
        for (int m : marchas) {
            if (Math.abs(rotacaoRpm - m) < Math.abs(rotacaoRpm - melhor)
                    || (Math.abs(rotacaoRpm - m) == Math.abs(rotacaoRpm - melhor) && m < melhor)) {
                melhor = m;
            }
        }
        return melhor;
    }
}
