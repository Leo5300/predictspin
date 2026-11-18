package br.senai.predictspin.referencia;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;

/**
 * Versão em uso da referência de uma máquina e tipo de dado, em memória (lida uma vez e guardada até o
 * próximo recálculo). Só devolve células suficientes: célula insuficiente não gera z.
 */
public final class ReferenciaAtiva {

    private record Chave(long pontoId, Medida medida, int marcha, String etapa, boolean porReceita, Long materialId,
                         Long ferramentaId) {
    }

    private final long versaoId;
    private final int numero;
    private final Map<Chave, CelulaGravada> celulas = new HashMap<>();
    private final Map<Long, String> calibracaoPorPonto = new HashMap<>();

    public ReferenciaAtiva(long versaoId, int numero, List<CelulaGravada> todas) {
        this.versaoId = versaoId;
        this.numero = numero;
        for (CelulaGravada c : todas) {
            celulas.put(new Chave(c.pontoId(), c.medida(), c.marchaRpm(), c.etapa(), c.porReceita(), c.materialId(),
                    c.ferramentaId()), c);
            if (c.calibracao() != null) {
                calibracaoPorPonto.put(c.pontoId(), c.calibracao());
            }
        }
    }

    public long versaoId() {
        return versaoId;
    }

    public int numero() {
        return numero;
    }

    /** Célula T0, T1 ou T3 genérica, se existir e for suficiente. */
    public Optional<CelulaGravada> celula(long pontoId, Medida medida, int marcha, String etapa) {
        return suficiente(celulas.get(new Chave(pontoId, medida, marcha, etapa, false, null, null)));
    }

    /** Célula da receita no T3, se existir e for suficiente. */
    public Optional<CelulaGravada> celulaDaReceita(long pontoId, Medida medida, int marcha, Long materialId,
                                                   Long ferramentaId) {
        return suficiente(celulas.get(new Chave(pontoId, medida, marcha, "T3", true, materialId, ferramentaId)));
    }

    /** Calibração das janelas usadas no ponto; nula quando o firmware não informava. */
    public String calibracao(long pontoId) {
        return calibracaoPorPonto.get(pontoId);
    }

    private static Optional<CelulaGravada> suficiente(CelulaGravada celula) {
        return celula != null && celula.suficiente() ? Optional.of(celula) : Optional.empty();
    }
}
