package br.senai.predictspin.alarme;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import br.senai.predictspin.alarme.AvaliacaoRepository.EnsaioDaJanela;
import br.senai.predictspin.alarme.AvaliacaoRepository.LinhaAvaliacao;
import br.senai.predictspin.alarme.AvaliacaoRepository.PontoDaJanela;
import br.senai.predictspin.alarme.AvaliacaoRepository.Severidade;
import br.senai.predictspin.alarme.MaquinaDeEstados.CondicaoInstrumento;
import br.senai.predictspin.alarme.MaquinaDeEstados.PassoInstrumento;
import br.senai.predictspin.alarme.MaquinaDeEstados.Transicao;
import br.senai.predictspin.alarme.dto.AvaliacaoResposta;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.referencia.FiltroQualidade;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaRepository;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;
import br.senai.predictspin.referencia.ReferenciaService;
import br.senai.predictspin.telemetria.IngestaoRepository.LinhaTelemetria;
import br.senai.predictspin.telemetria.JanelaRecebida;
import br.senai.predictspin.telemetria.ModoJanela;

/**
 * Avalia cada janela nova contra a referência, logo depois de a ingestão gravá-la: z de cada medida, estado
 * do ponto com atraso e histerese, alerta de instrumento e severidade acumulada. Grava UMA linha de
 * avaliação por janela e ponto (só quando há referência) e atualiza a linha de estado de cada ponto.
 * <ul>
 *   <li>Janela fora de ordem (medido_em anterior à última processada no ponto, como as da fila do
 *       dispositivo reenviadas depois de uma queda) é avaliada e gravada com o nível bruto, mas não mexe
 *       no estado: o estado anda só para a frente no tempo.</li>
 *   <li>Severidade: S += max(0, zMax − z de ATENÇÃO) × duração da janela, por ponto e dia; não conta
 *       janela de ensaio com condição diferente de "normal".</li>
 * </ul>
 */
@Service
public class AvaliacaoService {

    private static final Logger log = LoggerFactory.getLogger(AvaliacaoService.class);

    private final AvaliacaoRepository repositorio;
    private final ReferenciaService referencias;
    private final ReferenciaRepository celulas;
    private final MaquinaRepository maquinas;
    private final PropriedadesReferencia propRef;
    private final PropriedadesAlarme prop;
    private final ApplicationEventPublisher anuncios;
    private final TransactionTemplate transacao;
    private final AtomicLong falhas = new AtomicLong();
    private final Map<Long, List<Integer>> marchasPorMaquina = new ConcurrentHashMap<>();

    public AvaliacaoService(AvaliacaoRepository repositorio, ReferenciaService referencias,
                            ReferenciaRepository celulas, MaquinaRepository maquinas, PropriedadesReferencia propRef,
                            PropriedadesAlarme prop, ApplicationEventPublisher anuncios,
                            PlatformTransactionManager transacoes) {
        this.anuncios = anuncios;
        this.transacao = new TransactionTemplate(transacoes);
        this.transacao.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.repositorio = repositorio;
        this.referencias = referencias;
        this.celulas = celulas;
        this.maquinas = maquinas;
        this.propRef = propRef;
        this.prop = prop;
    }

    /** Um ponto da janela depois da regra. */
    public record PontoProcessado(long pontoId, String ponto, Avaliador.Resultado resultado, Transicao transicao,
                                  PassoInstrumento instrumento, EstadoPonto estado, List<Explicacao.Item> itens) {
    }

    /** O que a janela produziu (usado pelos alertas e pela OS). */
    public record ResultadoJanela(JanelaRecebida janela, EnsaioDaJanela ensaio, Long versaoId, int marcha,
                                  double duracaoS, List<PontoProcessado> pontos, String explicacao) {
    }

    /** Ensaio aberto com condição diferente de "normal" (gravação de falha provocada). */
    public static boolean deCondicao(EnsaioDaJanela ensaio) {
        return ensaio != null && !"normal".equals(ensaio.condicao());
    }

    /**
     * Roda DEPOIS do commit da janela e de a conexão da ingestão voltar ao pool (o
     * RecepcaoTelemetriaService anuncia fora de transação), numa transação própria, antes de a janela ir ao
     * fluxo ao vivo. Falha na avaliação nunca derruba a ingestão: a janela já está gravada, a resposta do
     * POST continua a mesma, e a falha vai para o log e para o contador do Diagnóstico.
     */
    @EventListener
    public void aoReceber(JanelaRecebida janela) {
        ResultadoJanela resultado;
        try {
            resultado = transacao.execute(status -> avaliar(janela));
        } catch (RuntimeException e) {
            falhas.incrementAndGet();
            log.error("Falha ao avaliar a janela {} da máquina {}: a janela está gravada, sem avaliação",
                    janela.janelaId(), janela.maquinaId(), e);
            return;
        }
        // depois do commit: a segunda opinião do modelo (quem escuta trata os próprios erros; mesmo assim, nada que
        // aconteça lá volta para cá)
        try {
            anuncios.publishEvent(new JanelaAvaliadaGravada(resultado));
        } catch (RuntimeException e) {
            log.error("Falha depois da avaliação da janela {} (segunda opinião): a regra não foi afetada",
                    janela.janelaId(), e);
        }
    }

    /** Janelas que ficaram sem avaliação por erro desde que a API subiu. */
    public long falhasDeAvaliacao() {
        return falhas.get();
    }

    /** Avalia e grava; devolve o resultado (para os alertas). */
    @Transactional
    public ResultadoJanela avaliar(JanelaRecebida j) {
        Optional<ReferenciaAtiva> ref = referencias.ativa(j.maquinaId(), j.simulado());
        List<Integer> marchas = marchasPorMaquina.computeIfAbsent(j.maquinaId(), repositorio::marchas);
        EnsaioDaJanela ensaio = j.ensaioId() == null ? null : repositorio.ensaio(j.ensaioId()).orElse(null);
        int marcha = FiltroQualidade.marcha(j.rotacaoRpm(), marchas);
        double duracao = j.modo() == ModoJanela.RAPIDO ? 1 : 5;
        boolean amostrasFaltando = FiltroQualidade.amostrasFaltando(j.amostras(), j.amostrasEsperadas(),
                propRef.amostrasMinFracao());
        FalhaDeAmostragem falha = falhaDeAmostragem(j, amostrasFaltando, propRef.amostrasMinFracao());
        boolean naoAvaliavel = j.saturou() || amostrasFaltando || !falha.pontos().isEmpty()
                || FiltroQualidade.foraDaMarcha(j.rotacaoRpm(), marchas, propRef.toleranciaMarcha());

        Map<Long, String> codigoPorId = new HashMap<>();
        j.pontosAtivos().forEach((codigo, id) -> codigoPorId.put(id, codigo));
        Map<Long, LinhaTelemetria> linhas = new LinkedHashMap<>();
        j.linhas().forEach(l -> linhas.put(l.pontoId(), l));

        // 1. avaliação de cada ponto enviado
        Map<Long, Avaliador.Resultado> resultados = new LinkedHashMap<>();
        ref.ifPresent(r -> linhas.forEach((pontoId, l) -> {
            String codigo = codigoPorId.get(pontoId);
            Avaliador.Contexto ctx = new Avaliador.Contexto(marcha, naoAvaliavel,
                    ensaio == null ? null : ensaio.etapa(), ensaio == null ? null : ensaio.materialId(),
                    ensaio == null ? null : ensaio.ferramentaId(),
                    br.senai.predictspin.referencia.CalculoReferencia.calibracaoDoPonto(j.calibracaoJson(), codigo));
            resultados.put(pontoId, Avaliador.avaliar(r, pontoId, ctx, valores(l),
                    l.o1x() == 0 && l.o2x() == 0 && l.o3x() == 0));
        }));

        // 2. regra de cada ponto ativo (os ausentes também andam: é assim que o instrumento percebe)
        Map<Long, EstadoPonto> estados = repositorio.travarEstados(codigoPorId.keySet(), j.simulado());
        List<PontoProcessado> processados = new ArrayList<>();
        List<Explicacao.Item> todosItens = new ArrayList<>();
        for (EstadoPonto e : estados.values()) {
            Avaliador.Resultado r = resultados.get(e.pontoId);
            LinhaTelemetria linha = linhas.get(e.pontoId);
            String codigo = codigoPorId.get(e.pontoId);
            Transicao transicao = new Transicao(e.estado, e.estado);
            PassoInstrumento instrumento = PassoInstrumento.NADA;
            if (e.ultimoMedidoEm == null || j.medidoEm().isAfter(e.ultimoMedidoEm)) {
                Double z = r != null && r.avaliada() ? r.zMax() : null;
                transicao = MaquinaDeEstados.passo(e, j.medidoEm(), duracao, z, prop);
                instrumento = MaquinaDeEstados.passoInstrumento(e, j.medidoEm(), duracao,
                        new CondicaoInstrumento(linha == null,
                                sinalBaixo(e.pontoId, resultados, linhas, j, tipicoDoSinal(ref, ensaio, marcha)),
                                falha.pontos().contains(e.pontoId), falha.identificada()), prop);
                e.ultimoMedidoEm = j.medidoEm();
            }
            List<Explicacao.Item> itens = itens(codigo, r, linha, marcha);
            todosItens.addAll(itens);
            processados.add(new PontoProcessado(e.pontoId, codigo, r, transicao, instrumento, e, itens));
        }

        // 3. severidade acumulada por dia (histórico de saúde: toda janela avaliada, inclusive a recuperada e a
        //    que ainda está no atraso). O contador que abre OS é outro e quem soma é a OS (OrdemServicoService).
        List<Severidade> somas = new ArrayList<>();
        if (!deCondicao(ensaio)) {
            Instant dia = j.medidoEm().truncatedTo(ChronoUnit.DAYS);
            for (PontoProcessado p : processados) {
                if (p.resultado() == null || !p.resultado().avaliada()) {
                    continue;
                }
                double acima = p.resultado().zMax() - prop.zAtencao();
                if (acima >= 0) {
                    double s = acima * duracao;
                    somas.add(new Severidade(p.pontoId(), dia, s, duracao / 3600));
                }
            }
        }

        long fora = processados.stream().filter(p -> p.resultado() != null && p.resultado().avaliada()
                && p.resultado().zMax() >= prop.zAtencao()).count();
        Long versaoId = ref.map(ReferenciaAtiva::versaoId).orElse(null);
        ResultadoJanela resultado = new ResultadoJanela(j, ensaio, versaoId, marcha, duracao, processados,
                Explicacao.texto(todosItens, fora == 1));

        // 4. gravação
        if (versaoId != null) {
            List<LinhaAvaliacao> linhasAvaliacao = new ArrayList<>();
            for (PontoProcessado p : processados) {
                Avaliador.Resultado r = p.resultado();
                if (r == null) {
                    continue;
                }
                Nivel estado = null;
                if (r.avaliada()) {
                    estado = p.estado().ultimoMedidoEm.equals(j.medidoEm()) ? p.estado().estado
                            : prop.nivelBruto(r.zMax());
                }
                linhasAvaliacao.add(new LinhaAvaliacao(p.pontoId(), versaoId, r.situacao(), estado, r.etapaRef(),
                        r.generica(), r.z()));
            }
            repositorio.inserirAvaliacoes(j.janelaId(), linhasAvaliacao);
        }
        if (!somas.isEmpty()) {
            repositorio.somarSeveridade(j.maquinaId(), j.simulado(), somas);
        }
        anuncios.publishEvent(new JanelaAvaliada(resultado));
        repositorio.gravarEstados(estados.values());
        return resultado;
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

    /**
     * Sensores com falha de amostragem nesta janela.
     *
     * @param pontos       pontos que saturaram ou ficaram com amostras faltando
     * @param identificada o envio disse qual sensor (campos por ponto); false quando só veio o "saturou" ou as
     *                     "amostras" da janela inteira e o ponto escolhido foi o de maior pico
     * @param saturou      algum ponto disse que saturou
     */
    record FalhaDeAmostragem(Set<Long> pontos, boolean identificada, boolean saturou) {
    }

    /**
     * O alerta de instrumento por saturação ou falta de amostras vai para o sensor que falhou: o ponto que
     * mandou {@code saturou = true}, ou cujas {@code amostras} ficaram abaixo da fração mínima. Quando o envio só
     * traz a falha da janela inteira (o firmware de 17/11/2026 manda assim), não dá para saber o sensor: fica
     * com o de maior pico, e o motivo do alerta diz isso.
     */
    static FalhaDeAmostragem falhaDeAmostragem(JanelaRecebida j, boolean amostrasFaltando, double fracaoMin) {
        Set<Long> pontos = new LinkedHashSet<>();
        boolean saturou = false;
        for (LinhaTelemetria l : j.linhas()) {
            if (Boolean.TRUE.equals(l.saturou())) {
                pontos.add(l.pontoId());
                saturou = true;
            }
            if (l.amostras() != null
                    && FiltroQualidade.amostrasFaltando(l.amostras(), j.amostrasEsperadas(), fracaoMin)) {
                pontos.add(l.pontoId());
            }
        }
        if (!pontos.isEmpty()) {
            return new FalhaDeAmostragem(pontos, true, saturou);
        }
        if (!j.saturou() && !amostrasFaltando) {
            return new FalhaDeAmostragem(Set.of(), true, false);
        }
        Set<Long> maiorPico = j.linhas().stream().max((a, b) -> Double.compare(a.picoG(), b.picoG()))
                .map(l -> Set.of(l.pontoId())).orElse(Set.of());
        return new FalhaDeAmostragem(maiorPico, false, false);
    }

    /**
     * Sinal sumido num ponto só: torno girando, RMS e 1X do ponto abaixo de {@code sinalFracao} do típico,
     * e pelo menos um outro ponto avaliado, sem nenhum outro em queda.
     */
    private boolean sinalBaixo(long pontoId, Map<Long, Avaliador.Resultado> resultados,
                               Map<Long, LinhaTelemetria> linhas, JanelaRecebida j, TipicoDoSinal tipico) {
        if (j.rotacaoRpm() <= 0 || !emQueda(pontoId, resultados, linhas, true, tipico)) {
            return false;
        }
        List<Long> outros = resultados.entrySet().stream()
                .filter(r -> r.getKey() != pontoId && r.getValue().avaliada()).map(Map.Entry::getKey).toList();
        return !outros.isEmpty() && outros.stream().noneMatch(o -> emQueda(o, resultados, linhas, false, tipico));
    }

    /** Célula com o típico de uma medida num ponto, para dizer se o sinal caiu. */
    @FunctionalInterface
    private interface TipicoDoSinal {
        Optional<CelulaGravada> celula(long pontoId, Avaliador.Resultado r, Medida medida);
    }

    /**
     * No uso sem ensaio, o típico do sinal é o do giro em vazio (T1), o menor normal com o torno girando:
     * a referência escolhida para o estado pode ser a do corte, e um ponto em vazio pareceria "em queda".
     * Dentro de ensaio, vale a célula usada na avaliação.
     */
    private static TipicoDoSinal tipicoDoSinal(Optional<ReferenciaAtiva> ref, EnsaioDaJanela ensaio, int marcha) {
        if (ensaio == null && ref.isPresent()) {
            return (pontoId, r, medida) -> ref.get().celula(pontoId, medida, marcha, "T1");
        }
        return (pontoId, r, medida) -> Optional.ofNullable(r.celulas().get(medida));
    }

    private boolean emQueda(long pontoId, Map<Long, Avaliador.Resultado> resultados, Map<Long, LinhaTelemetria> linhas,
                            boolean exigir1x, TipicoDoSinal tipico) {
        Avaliador.Resultado r = resultados.get(pontoId);
        LinhaTelemetria l = linhas.get(pontoId);
        if (r == null || !r.avaliada() || l == null) {
            return false;
        }
        Optional<CelulaGravada> rms = tipico.celula(pontoId, r, Medida.RMS_G);
        boolean rmsBaixo = rms.isPresent() && l.rmsG() < prop.sinalFracao() * rms.get().mediana();
        if (!exigir1x || !rmsBaixo) {
            return rmsBaixo;
        }
        Optional<CelulaGravada> o1x = tipico.celula(pontoId, r, Medida.O1X);
        return o1x.isPresent() && l.o1x() < prop.sinalFracao() * o1x.get().mediana();
    }

    private static List<Explicacao.Item> itens(String codigo, Avaliador.Resultado r, LinhaTelemetria linha,
                                               int marcha) {
        if (r == null || !r.avaliada() || linha == null) {
            return List.of();
        }
        Function<Medida, Double> valores = valores(linha);
        List<Explicacao.Item> itens = new ArrayList<>();
        r.z().forEach((medida, z) -> itens.add(new Explicacao.Item(codigo, medida, z, valores.apply(medida),
                r.celulas().get(medida).mediana(), marcha)));
        return itens;
    }

    // ------------------------------------------------------------------ consulta

    /** Avaliação da janela mais recente da máquina (real ou simulada). */
    @Transactional(readOnly = true)
    public AvaliacaoResposta atual(Long maquinaId, boolean simulado) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        Optional<AvaliacaoRepository.UltimaJanela> ultima = repositorio.ultimaJanela(maquinaId, simulado);
        if (ultima.isEmpty()) {
            return new AvaliacaoResposta(simulado, null, null, null, null, null, null, List.of(), null);
        }
        AvaliacaoRepository.UltimaJanela u = ultima.get();
        int marcha = FiltroQualidade.marcha(u.rotacaoRpm(),
                marchasPorMaquina.computeIfAbsent(maquinaId, repositorio::marchas));
        List<PontoDaJanela> pontos = repositorio.pontosDaJanela(u.janelaId());
        Long versaoId = pontos.stream().map(PontoDaJanela::versaoId).filter(v -> v != null).findFirst().orElse(null);
        Optional<ReferenciaAtiva> ativa = referencias.ativa(maquinaId, simulado);
        ReferenciaAtiva ref = versaoId == null ? null
                : ativa.filter(a -> a.versaoId() == versaoId)
                        .orElseGet(() -> new ReferenciaAtiva(versaoId, 0, celulas.celulas(versaoId)));
        Integer numero = versaoId == null ? null
                : ativa.filter(a -> a.versaoId() == versaoId).map(ReferenciaAtiva::numero).orElse(null);

        List<AvaliacaoResposta.PontoAvaliado> respostas = new ArrayList<>();
        List<Explicacao.Item> todos = new ArrayList<>();
        Nivel pior = null;
        int fora = 0;
        for (PontoDaJanela p : pontos) {
            Function<Medida, Optional<CelulaGravada>> celulasDoPonto = ref == null || p.etapaRef() == null
                    ? m -> Optional.empty() : celulasUsadas(ref, p, u, marcha);
            List<AvaliacaoResposta.MedidaAvaliada> medidas = new ArrayList<>();
            Double zMax = null;
            Medida dominante = null;
            for (Medida m : Medida.values()) {
                Double valor = p.valor(m);
                if (valor == null) {
                    continue;
                }
                Double z = p.z().get(m);
                Double tipico = z == null ? null : celulasDoPonto.apply(m).map(CelulaGravada::mediana).orElse(null);
                Explicacao.Item item = tipico == null ? null : new Explicacao.Item(p.ponto(), m, z, valor, tipico,
                        marcha);
                medidas.add(new AvaliacaoResposta.MedidaAvaliada(m, valor, tipico, z,
                        item == null ? null : item.diferencaPct()));
                if (item != null) {
                    todos.add(item);
                }
                if (z != null && m.entraNoEstado() && (zMax == null || z > zMax)) {
                    zMax = z;
                    dominante = m;
                }
            }
            Situacao situacao = p.situacao() == null ? Situacao.SEM_REFERENCIA : p.situacao();
            if (p.estado() != null) {
                pior = pior == null ? p.estado() : Nivel.pior(pior, p.estado());
            }
            if (zMax != null && zMax >= prop.zAtencao()) {
                fora++;
            }
            respostas.add(new AvaliacaoResposta.PontoAvaliado(p.ponto(), situacao, p.estado(), p.etapaRef(),
                    p.generica(), zMax, dominante, medidas));
        }
        return new AvaliacaoResposta(simulado, u.janelaId(), u.medidoEm(), u.rotacaoRpm(), marcha, pior, numero,
                respostas, Explicacao.texto(todos, fora == 1));
    }

    /** Células com que o ponto foi comparado (para o típico): a da receita no T3 com receita, senão a da etapa. */
    private static Function<Medida, Optional<CelulaGravada>> celulasUsadas(ReferenciaAtiva ref, PontoDaJanela p,
                                                                            AvaliacaoRepository.UltimaJanela u,
                                                                            int marcha) {
        boolean receita = "T3".equals(p.etapaRef()) && !p.generica() && "T3".equals(u.etapa())
                && (u.materialId() != null || u.ferramentaId() != null);
        if (receita) {
            return m -> ref.celulaDaReceita(p.pontoId(), m, marcha, u.materialId(), u.ferramentaId());
        }
        return Avaliador.celulasDa(ref, p.pontoId(), marcha, p.etapaRef());
    }
}
