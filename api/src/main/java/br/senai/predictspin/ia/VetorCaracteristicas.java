package br.senai.predictspin.ia;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

import br.senai.predictspin.alarme.Avaliador;
import br.senai.predictspin.alarme.Situacao;
import br.senai.predictspin.referencia.CalculoReferencia;
import br.senai.predictspin.referencia.FiltroQualidade;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.MotivoExclusao;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.telemetria.IngestaoRepository.LinhaTelemetria;
import br.senai.predictspin.telemetria.ModoJanela;

/**
 * O vetor de características de UMA janela de máquina (A, B e C juntos), calculado num lugar só: a exportação do
 * conjunto de treino e a inferência na API chamam esta mesma função, para não existir uma segunda implementação
 * que divirja. O Python só recebe a matriz pronta.
 * <p>
 * Versão {@value #VERSAO}, nesta ordem:
 * <ol>
 *   <li>{@code z_<ponto>_<medida>}: z de cada medida de A, B e C contra a referência em uso (rms_g, pico_g,
 *       curtose, o1x, o2x, o3x, vel_rms_mm_s), cortado em ±{@value #Z_MAX}; a velocidade falta (NaN) quando a
 *       janela não a trouxe;</li>
 *   <li>{@code log_rms_b_a} e {@code log_rms_c_a}: razões de RMS em log natural;</li>
 *   <li>{@code marcha_rpm} (rotação nominal) e {@code etapa_t3} (1 = corte, 0 = giro em vazio);</li>
 *   <li>{@code canal_<código>}: só dos canais HABILITADOS na fusão (valor bruto da janela; árvores não
 *       dependem da escala). Canal desabilitado fica fora do vetor.</li>
 * </ol>
 * "Referência em uso" = a da etapa, sem a célula da receita: dentro de ensaio, a da etapa do ensaio (T2 usa T1,
 * T3 usa a genérica da marcha); fora de ensaio, a mesma escolha da regra (T1 ou T3 genérica, a de menor pior
 * z). Assim o treino (gravado em ensaios) e a inferência (uso em aula) usam a mesma referência. Os valores
 * são arredondados para float, o tipo com que as árvores comparam.
 * <p>
 * Não gera vetor (e devolve o motivo): modo rápido, janela reprovada no filtro de qualidade, torno parado,
 * calibração diferente da referência ou falta de referência completa nos três pontos.
 */
public final class VetorCaracteristicas {

    public static final String VERSAO = "v1";
    public static final double Z_MAX = 50;
    public static final List<String> PONTOS = List.of("A", "B", "C");
    static final double EPSILON_RMS = 1e-6;

    private VetorCaracteristicas() {
    }

    /** Uma janela, com o que o vetor precisa. {@code linhas} por código do ponto; {@code canais} por código. */
    public record Janela(double rotacaoRpm, boolean saturou, ModoJanela modo, Integer amostras,
                         Integer amostrasEsperadas, String calibracaoJson, String etapaEnsaio, boolean ensaioDescartado,
                         Map<String, Long> pontoIdPorCodigo, Map<String, LinhaTelemetria> linhas,
                         Map<String, Double> canais) {
    }

    /** Resultado: o vetor ({@code valores} na ordem de {@code nomes}) ou o motivo de não ter vetor. */
    public record Resultado(List<String> nomes, double[] valores, String motivo, Map<String, Double> zPorNome) {

        public boolean temVetor() {
            return valores != null;
        }

        static Resultado sem(String motivo) {
            return new Resultado(List.of(), null, motivo, Map.of());
        }
    }

    /** Nomes das colunas, na ordem, com os canais habilitados dados. */
    public static List<String> nomes(List<String> canaisHabilitados) {
        List<String> nomes = new ArrayList<>();
        for (String ponto : PONTOS) {
            for (Medida m : Medida.values()) {
                nomes.add(nomeZ(ponto, m));
            }
        }
        nomes.add("log_rms_b_a");
        nomes.add("log_rms_c_a");
        nomes.add("marcha_rpm");
        nomes.add("etapa_t3");
        for (String canal : canaisHabilitados) {
            nomes.add("canal_" + canal);
        }
        return Collections.unmodifiableList(nomes);
    }

    public static String nomeZ(String ponto, Medida medida) {
        return "z_" + ponto + "_" + medida.valor();
    }

    /**
     * Monta o vetor.
     *
     * @param ref                referência em uso (máquina e tipo de dado da janela)
     * @param marchas            rotações nominais da máquina
     * @param canaisHabilitados  canais da fusão habilitados, na ordem das colunas
     */
    public static Resultado montar(Janela j, ReferenciaAtiva ref, List<Integer> marchas, PropriedadesReferencia prop,
                                   List<String> canaisHabilitados) {
        if (j.modo() == ModoJanela.RAPIDO) {
            return Resultado.sem(MotivoExclusao.MODO_RAPIDO.valor());
        }
        boolean ordensZeradas = j.linhas().values().stream()
                .anyMatch(l -> l.o1x() == 0 && l.o2x() == 0 && l.o3x() == 0);
        boolean saturouPonto = j.linhas().values().stream().anyMatch(l -> Boolean.TRUE.equals(l.saturou()));
        var motivos = FiltroQualidade.motivos(new FiltroQualidade.Entrada(j.saturou() || saturouPonto, j.modo(),
                j.amostras(), j.amostrasEsperadas(), j.rotacaoRpm(), ordensZeradas, j.ensaioDescartado()), marchas, prop);
        if (!motivos.isEmpty()) {
            return Resultado.sem(motivos.iterator().next().valor());
        }
        int marcha = FiltroQualidade.marcha(j.rotacaoRpm(), marchas);
        if (marcha == 0) {
            return Resultado.sem("parado");
        }
        if (ref == null) {
            return Resultado.sem("sem_referencia_completa");
        }
        String etapa = j.etapaEnsaio();
        Map<String, Avaliador.Resultado> porPonto = new LinkedHashMap<>();
        for (String ponto : PONTOS) {
            Long pontoId = j.pontoIdPorCodigo().get(ponto);
            LinhaTelemetria linha = j.linhas().get(ponto);
            if (pontoId == null || linha == null) {
                return Resultado.sem("sem_referencia_completa");
            }
            String calibracao = CalculoReferencia.calibracaoDoPonto(j.calibracaoJson(), ponto);
            // sem material e ferramenta: a referência da etapa, nunca a célula da receita (ver a classe)
            Avaliador.Contexto ctx = new Avaliador.Contexto(marcha, false, etapa, null, null, calibracao);
            Avaliador.Resultado r = Avaliador.avaliar(ref, pontoId, ctx, valores(linha), false);
            if (r.situacao() == Situacao.CALIBRACAO_DIFERENTE) {
                return Resultado.sem(Situacao.CALIBRACAO_DIFERENTE.valor());
            }
            if (!r.avaliada() || !("T1".equals(r.etapaRef()) || "T3".equals(r.etapaRef()))) {
                return Resultado.sem("sem_referencia_completa");
            }
            porPonto.put(ponto, r);
        }

        List<String> nomes = nomes(canaisHabilitados);
        double[] v = new double[nomes.size()];
        Map<String, Double> zPorNome = new LinkedHashMap<>();
        int i = 0;
        for (String ponto : PONTOS) {
            Map<Medida, Double> zs = porPonto.get(ponto).z();
            for (Medida m : Medida.values()) {
                Double z = zs.get(m);
                double valor = z == null ? Double.NaN : arredondar(Math.max(-Z_MAX, Math.min(Z_MAX, z)));
                v[i++] = valor;
                if (!Double.isNaN(valor)) {
                    zPorNome.put(nomeZ(ponto, m), valor);
                }
            }
        }
        double rmsA = j.linhas().get("A").rmsG();
        v[i++] = arredondar(Math.log((j.linhas().get("B").rmsG() + EPSILON_RMS) / (rmsA + EPSILON_RMS)));
        v[i++] = arredondar(Math.log((j.linhas().get("C").rmsG() + EPSILON_RMS) / (rmsA + EPSILON_RMS)));
        v[i++] = marcha;
        long corte = porPonto.values().stream().filter(r -> "T3".equals(r.etapaRef())).count();
        v[i++] = corte >= 2 ? 1 : 0;
        for (String canal : canaisHabilitados) {
            Double valor = j.canais() == null ? null : j.canais().get(canal);
            v[i++] = valor == null ? Double.NaN : arredondar(valor);
        }
        return new Resultado(nomes, v, null, Collections.unmodifiableMap(zPorNome));
    }

    /** Valor como o float com que as árvores comparam (ONNX e scikit-learn usam float32). */
    static double arredondar(double x) {
        return (float) x;
    }

    private static Function<Medida, Double> valores(LinhaTelemetria l) {
        return medida -> switch (medida) {
            case RMS_G -> l.rmsG();
            case PICO_G -> l.picoG();
            case CURTOSE -> l.curtose();
            case O1X -> l.o1x();
            case O2X -> l.o2x();
            case O3X -> l.o3x();
            case VEL_RMS_MM_S -> l.velRmsMmS();
        };
    }

    /** Posição de cada nome no vetor (para o modelo pegar as colunas que usa, pelo nome). */
    public static Map<String, Integer> posicoes(List<String> nomes) {
        Map<String, Integer> posicao = new LinkedHashMap<>();
        for (int k = 0; k < nomes.size(); k++) {
            posicao.put(nomes.get(k), k);
        }
        return posicao;
    }

    /** Valor de uma coluna pelo nome, se o vetor a tem e não é NaN. */
    public static Optional<Double> valor(Resultado r, String nome) {
        int k = r.nomes().indexOf(nome);
        return k < 0 || Double.isNaN(r.valores()[k]) ? Optional.empty() : Optional.of(r.valores()[k]);
    }
}
