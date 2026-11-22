package br.senai.predictspin.ia;

import java.text.NumberFormat;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.alarme.AvaliacaoRepository;
import br.senai.predictspin.alarme.AvaliacaoService.ResultadoJanela;
import br.senai.predictspin.alarme.JanelaAvaliadaGravada;
import br.senai.predictspin.ia.dto.MetadadosModelo;
import br.senai.predictspin.ia.dto.SegundaOpiniaoResposta;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaService;
import br.senai.predictspin.telemetria.IngestaoRepository.LinhaTelemetria;
import br.senai.predictspin.telemetria.JanelaRecebida;

/**
 * Segunda opinião: roda o modelo ATIVO (ONNX Runtime, {@link MotorOnnx}; docs/ia.md explica a escolha) da máquina e do tipo de dado em cada janela de máquina com vetor completo,
 * DEPOIS do commit da avaliação (na mesma fila da máquina). Grava a inferência compacta da janela e a opinião mais
 * recente nos alertas de máquina ativos e nas OS abertas (a da abertura, se ainda vazia).
 * <p>
 * Nunca muda estado, prioridade nem abertura: quem decide é a regra. Modelo ausente, incompatível ou com erro não
 * impede nada; o erro vai para o log e para o contador do Diagnóstico. Dado simulado só é avaliado por modelo
 * treinado com simulado, e o real só por modelo real (o modelo ativo é por máquina E tipo de dado).
 */
@Service
public class InferenciaService {

    private static final Logger log = LoggerFactory.getLogger(InferenciaService.class);

    static final Map<String, String> NOMES_CLASSES = Map.of("normal", "normal", "avanco_excessivo",
            "avanço excessivo", "rotacao_inadequada", "rotação inadequada", "ferramenta_desgastada",
            "ferramenta desgastada", "desbalanceamento", "desbalanceamento");

    private record Chave(long maquinaId, boolean simulado) {
    }

    /** Modelo ativo carregado (ou o motivo de não rodar). */
    public record Carga(ModeloRepository.Linha linha, MetadadosModelo meta, MotorModelo motor, String motivoNaoRoda) {

        public boolean roda() {
            return motor != null && motivoNaoRoda == null;
        }
    }

    private final ModeloRepository repositorio;
    private final ReferenciaService referencias;
    private final AvaliacaoRepository avaliacoes;
    private final PropriedadesReferencia propRef;
    private final PropriedadesModelo prop;
    private final PropriedadesFusao fusao;
    private final ObjectMapper json;
    private final TransactionTemplate transacao;
    private final Map<Chave, Optional<Carga>> cargas = new ConcurrentHashMap<>();
    private final Map<Long, List<Integer>> marchas = new ConcurrentHashMap<>();
    private final ReentrantReadWriteLock trava = new ReentrantReadWriteLock();
    private final AtomicLong inferencias = new AtomicLong();
    private final AtomicLong erros = new AtomicLong();
    private final AtomicReference<String> ultimoErro = new AtomicReference<>();

    public InferenciaService(ModeloRepository repositorio, ReferenciaService referencias,
                             AvaliacaoRepository avaliacoes, PropriedadesReferencia propRef, PropriedadesModelo prop,
                             PropriedadesFusao fusao, ObjectMapper json, PlatformTransactionManager transacoes) {
        this.repositorio = repositorio;
        this.referencias = referencias;
        this.avaliacoes = avaliacoes;
        this.propRef = propRef;
        this.prop = prop;
        this.fusao = fusao;
        this.json = json;
        this.transacao = new TransactionTemplate(transacoes);
        this.transacao.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ------------------------------------------------------------------ depois da avaliação

    @EventListener
    public void depoisDaAvaliacao(JanelaAvaliadaGravada evento) {
        ResultadoJanela r = evento.resultado();
        JanelaRecebida j = r.janela();
        try {
            Optional<SegundaOpiniaoResposta> opiniao = opinar(j, r.ensaio() == null ? null : r.ensaio().etapa());
            if (opiniao.isEmpty()) {
                return;
            }
            SegundaOpiniaoResposta o = opiniao.get();
            String texto = json.writeValueAsString(o);
            transacao.executeWithoutResult(s -> {
                repositorio.inserirInferencia(j.janelaId(), o.modeloId(), o.escore(), o.anomalia(),
                        o.classe() == null ? null : indiceDaClasse(j, o.classe()), o.confianca());
                repositorio.atualizarOpinioes(j.maquinaId(), j.simulado(), texto);
            });
            inferencias.incrementAndGet();
        } catch (Exception e) {
            erros.incrementAndGet();
            ultimoErro.set(Instant.now() + " janela " + j.janelaId() + ": " + e.getClass().getSimpleName() + " "
                    + e.getMessage());
            log.warn("Falha na segunda opinião da janela {} (a regra não foi afetada)", j.janelaId(), e);
        }
    }

    private Integer indiceDaClasse(JanelaRecebida j, String classe) {
        return carga(j.maquinaId(), j.simulado()).map(c -> c.meta().classes().indexOf(classe))
                .filter(i -> i >= 0).orElse(null);
    }

    /** Opinião do modelo ativo sobre a janela; vazio sem modelo, com modelo que não roda ou sem vetor. */
    public Optional<SegundaOpiniaoResposta> opinar(JanelaRecebida j, String etapaEnsaio) {
        trava.readLock().lock();
        try {
            Optional<Carga> carga = carga(j.maquinaId(), j.simulado());
            if (carga.isEmpty() || !carga.get().roda()) {
                return Optional.empty();
            }
            Optional<ReferenciaAtiva> ref = referencias.ativa(j.maquinaId(), j.simulado());
            if (ref.isEmpty()) {
                return Optional.empty();
            }
            Map<String, LinhaTelemetria> porCodigo = new java.util.HashMap<>();
            Map<Long, String> codigo = new java.util.HashMap<>();
            j.pontosAtivos().forEach((c, id) -> codigo.put(id, c));
            for (LinhaTelemetria l : j.linhas()) {
                porCodigo.put(codigo.get(l.pontoId()), l);
            }
            VetorCaracteristicas.Resultado v = VetorCaracteristicas.montar(new VetorCaracteristicas.Janela(
                    j.rotacaoRpm(), j.saturou(), j.modo(), j.amostras(), j.amostrasEsperadas(), j.calibracaoJson(),
                    etapaEnsaio, false, j.pontosAtivos(), porCodigo, j.canais()), ref.get(),
                    marchas.computeIfAbsent(j.maquinaId(), avaliacoes::marchas), propRef, fusao.habilitados());
            if (!v.temVetor()) {
                return Optional.empty();
            }
            return Optional.of(opiniao(carga.get(), v, j.janelaId(), j.medidoEm()));
        } finally {
            trava.readLock().unlock();
        }
    }

    /** Roda o modelo num vetor pronto (a mesma conta da janela ao vivo; usada também nos testes). */
    SegundaOpiniaoResposta opiniao(Carga c, VetorCaracteristicas.Resultado v, long janelaId, Instant medidoEm) {
        Map<String, Integer> posicao = VetorCaracteristicas.posicoes(v.nomes());
        List<String> usadas = c.meta().caracteristicas();
        float[] x = new float[usadas.size()];
        for (int i = 0; i < x.length; i++) {
            Integer p = posicao.get(usadas.get(i));
            double valor = p == null ? Double.NaN : v.valores()[p];
            if (Double.isNaN(valor)) {
                throw new IllegalStateException("característica " + usadas.get(i) + " ausente nesta janela");
            }
            x[i] = (float) valor;
        }
        MotorModelo.Saida s = c.motor().avaliar(x);
        boolean anomalia = s.escore() > c.linha().limiar();
        String classe = null;
        Double confianca = null;
        if (s.probabilidades() != null) {
            int melhor = 0;
            for (int i = 1; i < s.probabilidades().length; i++) {
                if (s.probabilidades()[i] > s.probabilidades()[melhor]) {
                    melhor = i;
                }
            }
            classe = c.meta().classes().get(melhor);
            confianca = s.probabilidades()[melhor];
        }
        boolean incerta = confianca != null && confianca < prop.confiancaMin();
        String explicacao = explicacao(c, v, s.escore(), anomalia, classe, confianca, incerta);
        String concordancia = anomalia ? "o modelo também vê anomalia" : "o modelo não vê anomalia";
        return new SegundaOpiniaoResposta(c.linha().id(), c.linha().versao(), janelaId, medidoEm, s.escore(),
                c.linha().limiar(), anomalia, classe, confianca, incerta, explicacao, concordancia,
                c.linha().simulado());
    }

    /**
     * Texto pronto: "classe provável: avanço excessivo (78%) · B·RMS 4,1σ, B·pico 3,6σ · modelo v3". As
     * características citadas são as de maior importância por permutação × |z| nesta janela.
     */
    private String explicacao(Carga c, VetorCaracteristicas.Resultado v, double escore, boolean anomalia, String classe,
                              Double confianca, boolean incerta) {
        NumberFormat pct = NumberFormat.getPercentInstance(Locale.forLanguageTag("pt-BR"));
        NumberFormat num = NumberFormat.getNumberInstance(Locale.forLanguageTag("pt-BR"));
        num.setMaximumFractionDigits(1);
        num.setMinimumFractionDigits(1);
        String parte1;
        if (classe == null) {
            NumberFormat esc = NumberFormat.getNumberInstance(Locale.forLanguageTag("pt-BR"));
            esc.setMaximumFractionDigits(2);
            esc.setMinimumFractionDigits(2);
            parte1 = (anomalia ? "o modelo vê anomalia" : "o modelo não vê anomalia") + " (escore " + esc.format(escore)
                    + ", limite " + esc.format(c.linha().limiar()) + ")";
        } else if (incerta) {
            parte1 = "classe incerta (mais parecida: " + NOMES_CLASSES.getOrDefault(classe, classe) + ", "
                    + pct.format(confianca) + ")";
        } else {
            parte1 = "classe provável: " + NOMES_CLASSES.getOrDefault(classe, classe) + " (" + pct.format(confianca)
                    + ")";
        }
        Map<String, Double> pesos = c.meta().pesos() == null ? Map.of() : c.meta().pesos();
        List<Map.Entry<String, Double>> candidatas = new ArrayList<>(v.zPorNome().entrySet());
        candidatas.removeIf(e -> !c.meta().caracteristicas().contains(e.getKey()));
        candidatas.sort(Comparator.comparingDouble(
                (Map.Entry<String, Double> e) -> -pesos.getOrDefault(e.getKey(), 0.0) * Math.abs(e.getValue())));
        List<String> citadas = new ArrayList<>();
        for (Map.Entry<String, Double> e : candidatas.subList(0, Math.min(prop.explicacaoTop(), candidatas.size()))) {
            if (pesos.getOrDefault(e.getKey(), 0.0) <= 0) {
                continue;
            }
            citadas.add(rotulo(e.getKey()) + " " + num.format(e.getValue()) + "σ");
        }
        return parte1 + (citadas.isEmpty() ? "" : " · " + String.join(", ", citadas)) + " · modelo v"
                + c.linha().versao();
    }

    /** z_B_rms_g → "B·RMS". */
    static String rotulo(String nomeZ) {
        String[] partes = nomeZ.split("_", 3);
        return partes[1] + "·" + Medida.de(partes[2]).rotulo();
    }

    // ------------------------------------------------------------------ modelo ativo

    /** Modelo ativo da máquina e tipo de dado, carregado uma vez e guardado até a próxima ativação. */
    public Optional<Carga> carga(long maquinaId, boolean simulado) {
        return cargas.computeIfAbsent(new Chave(maquinaId, simulado), k -> carregar(maquinaId, simulado));
    }

    private Optional<Carga> carregar(long maquinaId, boolean simulado) {
        Optional<ModeloRepository.Linha> ativo = repositorio.ativo(maquinaId, simulado);
        if (ativo.isEmpty()) {
            return Optional.empty();
        }
        ModeloRepository.Linha linha = ativo.get();
        MetadadosModelo meta;
        try {
            meta = json.readValue(linha.metadados(), MetadadosModelo.class);
        } catch (Exception e) {
            return Optional.of(new Carga(linha, null, null, "metadados ilegíveis: " + e.getMessage()));
        }
        String motivo = incompatibilidade(linha, meta);
        if (motivo != null) {
            return Optional.of(new Carga(linha, meta, null, motivo));
        }
        try {
            ModeloRepository.Arquivos a = repositorio.arquivos(linha.id());
            MotorModelo motor = new MotorOnnx(a.anomalia(), a.classe(), meta.offsetAnomalia(),
                    meta.caracteristicas().size());
            return Optional.of(new Carga(linha, meta, motor, null));
        } catch (RuntimeException e) {
            erros.incrementAndGet();
            ultimoErro.set(Instant.now() + " carregando o modelo " + linha.id() + ": " + e.getMessage());
            return Optional.of(new Carga(linha, meta, null, "não foi possível carregar o modelo: " + e.getMessage()));
        }
    }

    /** O modelo não roda quando a versão do vetor ou um canal exigido não bate (o Diagnóstico diz por quê). */
    String incompatibilidade(ModeloRepository.Linha linha, MetadadosModelo meta) {
        if (!VetorCaracteristicas.VERSAO.equals(linha.versaoVetor())) {
            return "versão do vetor do modelo (" + linha.versaoVetor() + ") diferente da API ("
                    + VetorCaracteristicas.VERSAO + "): treine de novo";
        }
        List<String> habilitados = fusao.habilitados();
        for (String canal : meta.canais() == null ? List.<String>of() : meta.canais()) {
            if (!habilitados.contains(canal)) {
                return "o modelo exige o canal " + canal + ", desabilitado na fusão (ps.fusao.canais." + canal
                        + ".habilitado)";
            }
        }
        List<String> nomes = VetorCaracteristicas.nomes(habilitados);
        for (String c : meta.caracteristicas()) {
            if (!nomes.contains(c)) {
                return "o modelo usa a característica " + c + ", que o vetor " + VetorCaracteristicas.VERSAO
                        + " não tem";
            }
        }
        return null;
    }

    /** Esquece o modelo carregado (depois de uma ativação); o próximo uso carrega o novo. */
    public void recarregar(long maquinaId, boolean simulado) {
        trava.writeLock().lock();
        try {
            Optional<Carga> antiga = cargas.remove(new Chave(maquinaId, simulado));
            if (antiga != null) {
                antiga.filter(c -> c.motor() != null).ifPresent(c -> c.motor().close());
            }
        } finally {
            trava.writeLock().unlock();
        }
    }

    /** Esquece todos (testes). */
    public void esquecer() {
        trava.writeLock().lock();
        try {
            cargas.values().forEach(o -> o.filter(c -> c.motor() != null).ifPresent(c -> c.motor().close()));
            cargas.clear();
            marchas.clear();
        } finally {
            trava.writeLock().unlock();
        }
    }

    public long inferencias() {
        return inferencias.get();
    }

    public long erros() {
        return erros.get();
    }

    public String ultimoErro() {
        return ultimoErro.get();
    }
}
