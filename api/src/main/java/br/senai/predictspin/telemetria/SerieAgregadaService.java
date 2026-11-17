package br.senai.predictspin.telemetria;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.telemetria.dto.SerieAgregadaResposta;
import br.senai.predictspin.telemetria.dto.SerieAgregadaResposta.Intervalo;
import br.senai.predictspin.telemetria.dto.SerieAgregadaResposta.PontoAgregado;

/**
 * Série agregada para tendências longas e para o mapa de ordens. O período é dividido em N
 * intervalos iguais; a agregação é feita no banco. Intervalo sem janela é devolvido vazio.
 */
@Service
@Transactional(readOnly = true)
public class SerieAgregadaService {

    /** Período padrão quando "de" não é informado. */
    static final Duration PERIODO_PADRAO = Duration.ofHours(24);
    /** Protege a instância pequena de produção de uma agregação sobre meses de dados. */
    static final Duration PERIODO_MAXIMO = Duration.ofDays(31);
    public static final int BALDES_MAXIMO = 600;

    private final SerieRepository series;
    private final MaquinaRepository maquinas;
    private final Clock relogio;

    public SerieAgregadaService(SerieRepository series, MaquinaRepository maquinas, Clock relogio) {
        this.series = series;
        this.maquinas = maquinas;
        this.relogio = relogio;
    }

    public SerieAgregadaResposta agregar(Long maquinaId, Instant de, Instant ate, Boolean simulado, int baldes) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        if (baldes < 1 || baldes > BALDES_MAXIMO) {
            throw new RequisicaoInvalidaException("'baldes' precisa estar entre 1 e " + BALDES_MAXIMO);
        }
        Instant fim = ate != null ? ate : relogio.instant();
        Instant inicio = de != null ? de : fim.minus(PERIODO_PADRAO);
        if (!inicio.isBefore(fim)) {
            throw new RequisicaoInvalidaException("'de' precisa ser anterior a 'ate'");
        }
        Duration periodo = Duration.between(inicio, fim);
        if (periodo.compareTo(PERIODO_MAXIMO) > 0) {
            throw new RequisicaoInvalidaException("O período máximo da série agregada é de "
                    + PERIODO_MAXIMO.toDays() + " dias");
        }
        double largura = periodo.toNanos() / 1e9 / baldes;

        Map<Integer, Acumulado> porBalde = new LinkedHashMap<>();
        TreeSet<String> codigos = new TreeSet<>();
        for (SerieRepository.Linha linha : series.agregar(maquinaId, inicio, fim, simulado, baldes, largura)) {
            Acumulado acumulado = porBalde.computeIfAbsent(linha.balde(),
                    b -> new Acumulado(linha.janelas(), linha.rotacaoMedia(), linha.saturou()));
            if (linha.ponto() != null) {
                codigos.add(linha.ponto());
                acumulado.pontos.put(linha.ponto(), new PontoAgregado(linha.rmsMedia(), linha.rmsMax(),
                        linha.picoMax(), linha.curtoseMedia(), linha.o1xMedia(), linha.o2xMedia(), linha.o3xMedia(),
                        linha.velMedia(), linha.velMax()));
            }
        }

        List<Intervalo> intervalos = new ArrayList<>(baldes);
        long larguraNanos = periodo.toNanos() / baldes;
        for (int i = 0; i < baldes; i++) {
            Instant inicioBalde = inicio.plusNanos(larguraNanos * i);
            Instant fimBalde = i == baldes - 1 ? fim : inicio.plusNanos(larguraNanos * (i + 1));
            Acumulado a = porBalde.get(i);
            intervalos.add(a == null
                    ? new Intervalo(i, inicioBalde, fimBalde, 0, null, false, Map.of())
                    : new Intervalo(i, inicioBalde, fimBalde, a.janelas, a.rotacaoMedia, a.saturou, a.pontos));
        }
        return new SerieAgregadaResposta(maquinaId, inicio, fim, simulado, baldes, largura, List.copyOf(codigos),
                intervalos);
    }

    private static final class Acumulado {
        private final long janelas;
        private final double rotacaoMedia;
        private final boolean saturou;
        private final Map<String, PontoAgregado> pontos = new LinkedHashMap<>();

        private Acumulado(long janelas, double rotacaoMedia, boolean saturou) {
            this.janelas = janelas;
            this.rotacaoMedia = rotacaoMedia;
            this.saturou = saturou;
        }
    }
}
