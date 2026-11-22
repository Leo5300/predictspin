package br.senai.predictspin.ia;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.ia.dto.IaDiagnosticoResposta;
import br.senai.predictspin.ia.dto.MetadadosModelo;
import br.senai.predictspin.ia.dto.ModeloDetalheResposta;
import br.senai.predictspin.ia.dto.ModeloResumoResposta;
import br.senai.predictspin.ia.dto.TrabalhoTreinoResposta;
import br.senai.predictspin.ia.dto.TreinoEvento;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaService;

/**
 * Botão Treinar, resultado do treino e ativação de versões.
 * <ul>
 *   <li><b>Treinar</b>: cria o trabalho. Com {@code ps.treino.url}, acorda o serviço de treino (espera até
 *       {@code ps.treino.espera-acordar-s}; o trabalho mostra "acordando o serviço de treino") e pede o treino; o
 *       serviço busca o conjunto e devolve o modelo pela rota do serviço. Sem URL, o trabalho fica com o comando
 *       que faz o mesmo no notebook.</li>
 *   <li><b>Resultado</b>: os arquivos são conferidos carregando o ONNX (o caminho de produção); a versão nova
 *       nasce CANDIDATA. Só ADMIN ativa (uma ATIVA por máquina e tipo de dado; a
 *       anterior vira ARQUIVADA).</li>
 * </ul>
 */
@Service
public class TreinoService implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(TreinoService.class);
    static final String PENDENTE = "pendente";
    static final String ACORDANDO = "acordando";
    static final String EXECUTANDO = "executando";
    static final String CONCLUIDO = "concluido";
    static final String FALHOU = "falhou";
    static final String CANDIDATO = "candidato";
    static final String ATIVO = "ativo";
    /** Caminho de produção: ONNX Runtime (memória medida abaixo do critério no cenário realista; docs/ia.md). */
    static final String CAMINHO = "onnx";

    private final ModeloRepository repositorio;
    private final MaquinaRepository maquinas;
    private final ReferenciaService referencias;
    private final InferenciaService inferencias;
    private final PropriedadesTreino treino;
    private final PropriedadesModelo prop;
    private final PropriedadesFusao fusao;
    private final PropriedadesTendencia tendencia;
    private final ObjectMapper json;
    private final ApplicationEventPublisher anuncios;
    private final Clock relogio;
    private final TransactionTemplate transacao;
    private final ExecutorService acordar = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "treino-acordar");
        t.setDaemon(true);
        return t;
    });
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private volatile Duration intervaloSondagem = Duration.ofSeconds(5);

    public TreinoService(ModeloRepository repositorio, MaquinaRepository maquinas, ReferenciaService referencias,
                         InferenciaService inferencias, PropriedadesTreino treino, PropriedadesModelo prop,
                         PropriedadesFusao fusao, PropriedadesTendencia tendencia, ObjectMapper json,
                         ApplicationEventPublisher anuncios, Clock relogio, PlatformTransactionManager transacoes) {
        this.repositorio = repositorio;
        this.maquinas = maquinas;
        this.referencias = referencias;
        this.inferencias = inferencias;
        this.treino = treino;
        this.prop = prop;
        this.fusao = fusao;
        this.tendencia = tendencia;
        this.json = json;
        this.anuncios = anuncios;
        this.relogio = relogio;
        this.transacao = new TransactionTemplate(transacoes);
    }

    /** Intervalo entre as tentativas de acordar o serviço (testes encurtam). */
    void intervaloSondagem(Duration intervalo) {
        this.intervaloSondagem = intervalo;
    }

    // ------------------------------------------------------------------ treinar

    @Transactional
    public TrabalhoTreinoResposta treinar(long maquinaId, boolean simulado, Long usuarioId) {
        exigirMaquina(maquinaId);
        Instant agora = relogio.instant();
        long id;
        try {
            id = repositorio.criarTrabalho(maquinaId, simulado, usuarioId, treino.temServico() ? ACORDANDO : PENDENTE,
                    null, agora);
        } catch (DuplicateKeyException e) {
            throw new ConflitoException("Já há um treino em andamento nesta máquina para este tipo de dado: espere ele "
                    + "concluir ou falhar.");
        }
        String mensagem = treino.temServico() ? "acordando o serviço de treino"
                : "Sem serviço de treino configurado (ps.treino.url): rode o comando abaixo no notebook, com "
                + "TREINO_CHAVE definida. Ele faz o mesmo treino e entrega o modelo a esta API.";
        repositorio.mudarTrabalho(id, treino.temServico() ? ACORDANDO : PENDENTE, mensagem, null, null, null);
        TrabalhoTreinoResposta t = trabalho(id);
        anunciarTreino(t);
        if (treino.temServico()) {
            depoisDoCommit(() -> acordar.submit(() -> acordarEPedir(id)));
        }
        return t;
    }

    private static void depoisDoCommit(Runnable r) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    r.run();
                }
            });
        } else {
            r.run();
        }
    }

    /** Acorda o serviço de treino (o plano gratuito dorme) e pede o treino. Roda fora da thread do pedido. */
    void acordarEPedir(long id) {
        try {
            tentarAcordarEPedir(id);
        } catch (InterruptedException e) {
            // desligamento da API: o trabalho fica como está e vence pelo prazo
            Thread.currentThread().interrupt();
        }
    }

    private void tentarAcordarEPedir(long id) throws InterruptedException {
        String base = treino.url().replaceAll("/+$", "");
        Instant limite = relogio.instant().plusSeconds(treino.esperaAcordarS());
        boolean acordado = false;
        while (!acordado && relogio.instant().isBefore(limite)) {
            try {
                HttpResponse<Void> r = http.send(HttpRequest.newBuilder(URI.create(base + "/saude"))
                        .timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.discarding());
                acordado = r.statusCode() == 200;
            } catch (IOException e) {
                log.debug("serviço de treino ainda não respondeu: {}", e.getMessage());
            }
            if (!acordado) {
                Thread.sleep(intervaloSondagem.toMillis());
            }
        }
        if (!acordado) {
            falhar(id, "o serviço de treino não respondeu em " + treino.esperaAcordarS() + " s");
            return;
        }
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(base + "/treinar"))
                    .timeout(Duration.ofSeconds(30)).header("Content-Type", "application/json")
                    .header("X-Treino-Chave", treino.chave())
                    .POST(HttpRequest.BodyPublishers.ofString("{\"trabalho_id\":" + id + "}")).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() == 202) {
                mudar(id, ACORDANDO, EXECUTANDO, "treinando no serviço de treino");
            } else {
                falhar(id, "o serviço de treino recusou o pedido (HTTP " + r.statusCode() + ")");
            }
        } catch (IOException e) {
            falhar(id, "falha ao chamar o serviço de treino: " + e.getMessage());
        }
    }

    /** Muda o estado só se o trabalho ainda estiver em {@code de} (o serviço pode ter avançado antes). */
    private void mudar(long id, String de, String para, String mensagem) {
        transacao.executeWithoutResult(s -> {
            if (repositorio.travarTrabalho(id).filter(de::equals).isPresent()) {
                repositorio.mudarTrabalho(id, para, mensagem, EXECUTANDO.equals(para) ? relogio.instant() : null, null,
                        null);
                anunciarTreino(trabalho(id));
            }
        });
    }

    private void falhar(long id, String mensagem) {
        transacao.executeWithoutResult(s -> marcarFalha(id, mensagem));
    }

    private void marcarFalha(long id, String mensagem) {
        Optional<String> estado = repositorio.travarTrabalho(id);
        if (estado.isPresent() && emAndamento(estado.get())) {
            repositorio.mudarTrabalho(id, FALHOU, mensagem, null, relogio.instant(), null);
            anunciarTreino(trabalho(id));
        }
    }

    private static boolean emAndamento(String estado) {
        return PENDENTE.equals(estado) || ACORDANDO.equals(estado) || EXECUTANDO.equals(estado);
    }

    /** Trabalho que passou do prazo vira FALHOU (serviço que caiu no meio, comando que ninguém rodou). */
    @Scheduled(fixedDelayString = "${ps.treino.verificar-prazo:60s}")
    public void vencerAtrasados() {
        Instant limite = relogio.instant().minus(Duration.ofMinutes(treino.prazoExecucaoMin()));
        for (ModeloRepository.Trabalho t : repositorio.vencidos(limite)) {
            falhar(t.id(), "passou do prazo de " + treino.prazoExecucaoMin() + " min sem resultado");
        }
    }

    // ------------------------------------------------------------------ rotas do serviço de treino

    @Transactional
    public TrabalhoTreinoResposta iniciar(long id) {
        String estado = repositorio.travarTrabalho(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Trabalho " + id + " não encontrado"));
        if (!emAndamento(estado)) {
            throw new ConflitoException("Trabalho " + id + " já está " + estado);
        }
        repositorio.mudarTrabalho(id, EXECUTANDO, "treinando", relogio.instant(), null, null);
        TrabalhoTreinoResposta t = trabalho(id);
        anunciarTreino(t);
        return t;
    }

    @Transactional
    public TrabalhoTreinoResposta registrarFalha(long id, String mensagem) {
        repositorio.travarTrabalho(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Trabalho " + id + " não encontrado"));
        marcarFalha(id, "o treino falhou: " + (mensagem == null || mensagem.isBlank() ? "sem detalhe" : mensagem));
        return trabalho(id);
    }

    /** Arquivos do modelo enviados pelo serviço de treino (ou pelo comando no notebook). */
    public record ArquivosRecebidos(byte[] anomalia, byte[] classe, byte[] arvores, byte[] metadados) {
    }

    @Transactional(noRollbackFor = RequisicaoInvalidaException.class)
    public ModeloResumoResposta receberResultado(long id, ArquivosRecebidos a) {
        String estado = repositorio.travarTrabalho(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Trabalho " + id + " não encontrado"));
        if (!emAndamento(estado)) {
            throw new ConflitoException("Trabalho " + id + " já está " + estado);
        }
        ModeloRepository.Trabalho t = repositorio.trabalho(id).orElseThrow();
        MetadadosModelo meta;
        try {
            meta = validar(t, a);
        } catch (RequisicaoInvalidaException e) {
            marcarFalha(id, "resultado recusado: " + e.getMessage());
            throw e;
        }
        int tamanho = a.anomalia().length + (a.classe() == null ? 0 : a.classe().length)
                + (a.arvores() == null ? 0 : a.arvores().length);
        long modeloId = repositorio.inserir(new ModeloRepository.Novo(t.maquinaId(), t.simulado(), null, id,
                meta.versaoVetor(), meta.referenciaVersaoId(), meta.referenciaNumero(), meta.limiarAnomalia(),
                json.valueToTree(meta.caracteristicas()).toString(), json.valueToTree(meta.canais()).toString(),
                json.valueToTree(meta.classes()).toString(),
                new String(a.metadados(), java.nio.charset.StandardCharsets.UTF_8),
                json.valueToTree(meta.conjunto()).toString(), a.anomalia(), a.classe(), a.arvores(), tamanho));
        repositorio.mudarTrabalho(id, CONCLUIDO, "versão nova criada como candidata; um ADMIN decide se ativa",
                null, relogio.instant(), modeloId);
        anunciarTreino(trabalho(id));
        ModeloResumoResposta m = resumo(repositorio.buscar(modeloId).orElseThrow());
        anuncios.publishEvent(new ModeloAlterado(m.maquinaId(), m.simulado(), new TreinoEvento.Modelo(CANDIDATO, m,
                null)));
        return m;
    }

    private MetadadosModelo validar(ModeloRepository.Trabalho t, ArquivosRecebidos a) {
        if (a.anomalia() == null || a.anomalia().length == 0 || a.metadados() == null) {
            throw new RequisicaoInvalidaException("faltam arquivos: anomalia e metadados são obrigatórios");
        }
        for (byte[] arquivo : new byte[][] {a.anomalia(), a.classe(), a.arvores()}) {
            if (arquivo != null && arquivo.length > prop.tamanhoMaxBytes()) {
                throw new RequisicaoInvalidaException("arquivo de modelo com " + arquivo.length + " bytes; o máximo é "
                        + prop.tamanhoMaxMb() + " MB (ps.modelo.tamanho-max-mb)");
            }
        }
        MetadadosModelo meta;
        try {
            meta = json.readValue(a.metadados(), MetadadosModelo.class);
        } catch (IOException e) {
            throw new RequisicaoInvalidaException("metadados ilegíveis: " + e.getMessage());
        }
        if (!VetorCaracteristicas.VERSAO.equals(meta.versaoVetor())) {
            throw new RequisicaoInvalidaException("vetor " + meta.versaoVetor() + " diferente do da API ("
                    + VetorCaracteristicas.VERSAO + ")");
        }
        if (meta.simulado() != t.simulado()) {
            throw new RequisicaoInvalidaException("o trabalho é de dado " + (t.simulado() ? "simulado" : "real")
                    + " e o modelo veio de dado " + (meta.simulado() ? "simulado" : "real"));
        }
        if (meta.referenciaVersaoId() != null && !repositorio.referenciaExiste(meta.referenciaVersaoId(),
                t.maquinaId(), t.simulado())) {
            throw new RequisicaoInvalidaException("versão da referência " + meta.referenciaVersaoId()
                    + " desconhecida nesta máquina e tipo de dado");
        }
        if (meta.caracteristicas() == null || meta.caracteristicas().isEmpty()) {
            throw new RequisicaoInvalidaException("metadados sem a lista de características");
        }
        boolean temClasses = meta.classes() != null && !meta.classes().isEmpty();
        if (temClasses != (a.classe() != null)) {
            throw new RequisicaoInvalidaException("classes nos metadados e arquivo do classificador não combinam");
        }
        try (MotorModelo motor = new MotorOnnx(a.anomalia(), a.classe(), meta.offsetAnomalia(),
                meta.caracteristicas().size())) {
            MotorModelo.Saida s = motor.avaliar(new float[meta.caracteristicas().size()]);
            if (temClasses && s.probabilidades().length != meta.classes().size()) {
                throw new RequisicaoInvalidaException("o classificador devolve " + s.probabilidades().length
                        + " probabilidades para " + meta.classes().size() + " classes");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RequisicaoInvalidaException("modelo inválido: " + e.getMessage());
        }
        return meta;
    }

    // ------------------------------------------------------------------ versões

    @Transactional
    public ModeloDetalheResposta ativar(long modeloId, Long usuarioId) {
        ModeloRepository.Linha m = repositorio.buscar(modeloId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Modelo " + modeloId + " não encontrado"));
        if (ATIVO.equals(m.estado())) {
            throw new ConflitoException("A versão " + m.versao() + " já está ativa");
        }
        Integer anterior = repositorio.ativo(m.maquinaId(), m.simulado()).map(ModeloRepository.Linha::versao)
                .orElse(null);
        repositorio.ativar(m, usuarioId, relogio.instant());
        depoisDoCommit(() -> inferencias.recarregar(m.maquinaId(), m.simulado()));
        ModeloDetalheResposta d = detalhe(modeloId);
        anuncios.publishEvent(new ModeloAlterado(m.maquinaId(), m.simulado(),
                new TreinoEvento.Modelo("ativado", d.modelo(), anterior)));
        return d;
    }

    @Transactional(readOnly = true)
    public Pagina<ModeloResumoResposta> listar(long maquinaId, boolean simulado, int pagina, int tamanho) {
        exigirMaquina(maquinaId);
        long total = repositorio.contar(maquinaId, simulado);
        List<ModeloResumoResposta> itens = repositorio.listar(maquinaId, simulado, tamanho, (long) pagina * tamanho)
                .stream().map(this::resumo).toList();
        return new Pagina<>(itens, pagina, tamanho, total, (int) ((total + tamanho - 1) / tamanho));
    }

    @Transactional(readOnly = true)
    public ModeloDetalheResposta detalhe(long modeloId) {
        ModeloRepository.Linha m = repositorio.buscar(modeloId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Modelo " + modeloId + " não encontrado"));
        MetadadosModelo meta = metadados(m);
        List<String> avisos = new ArrayList<>(avisos(m, meta));
        return new ModeloDetalheResposta(resumo(m), meta, avisos, CAMINHO);
    }

    private List<String> avisos(ModeloRepository.Linha m, MetadadosModelo meta) {
        List<String> avisos = new ArrayList<>();
        if (m.simulado()) {
            avisos.add("dado simulado: não é resultado");
        }
        Optional<ReferenciaAtiva> ref = referencias.ativa(m.maquinaId(), m.simulado());
        if (ref.isPresent() && m.referenciaVersaoId() != null && ref.get().versaoId() != m.referenciaVersaoId()) {
            avisos.add("referência mudou: treine de novo (o modelo usou a versão " + m.referenciaNumero()
                    + " da referência; a em uso é a " + ref.get().numero() + ")");
        }
        String incompatibilidade = inferencias.incompatibilidade(m, meta);
        if (incompatibilidade != null) {
            avisos.add("não roda: " + incompatibilidade);
        }
        if (meta.avisos() != null) {
            avisos.addAll(meta.avisos());
        }
        return avisos;
    }

    @Transactional(readOnly = true)
    public TrabalhoTreinoResposta trabalho(long id) {
        ModeloRepository.Trabalho t = repositorio.trabalho(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Trabalho " + id + " não encontrado"));
        return resposta(t);
    }

    @Transactional(readOnly = true)
    public Pagina<TrabalhoTreinoResposta> trabalhos(long maquinaId, boolean simulado, int pagina, int tamanho) {
        exigirMaquina(maquinaId);
        long total = repositorio.contarTrabalhos(maquinaId, simulado);
        List<TrabalhoTreinoResposta> itens = repositorio.trabalhos(maquinaId, simulado, tamanho,
                (long) pagina * tamanho).stream().map(this::resposta).toList();
        return new Pagina<>(itens, pagina, tamanho, total, (int) ((total + tamanho - 1) / tamanho));
    }

    private TrabalhoTreinoResposta resposta(ModeloRepository.Trabalho t) {
        String comando = !treino.temServico() && emAndamento(t.estado())
                ? "python -m analise.treino --api <endereço desta API> --trabalho " + t.id() : null;
        return new TrabalhoTreinoResposta(t.id(), t.maquinaId(), t.simulado(), t.estado(), t.mensagem(), comando,
                t.criadoEm(), t.criadoPor(), t.iniciadoEm(), t.concluidoEm(), t.modeloId(), t.modeloVersao());
    }

    // ------------------------------------------------------------------ diagnóstico

    @Transactional(readOnly = true)
    public IaDiagnosticoResposta diagnostico(long maquinaId, boolean simulado) {
        exigirMaquina(maquinaId);
        Optional<ModeloRepository.Linha> ativo = repositorio.ativo(maquinaId, simulado);
        Optional<InferenciaService.Carga> carga = inferencias.carga(maquinaId, simulado);
        List<String> avisos = new ArrayList<>();
        String motivo = carga.map(InferenciaService.Carga::motivoNaoRoda).orElse(null);
        IaDiagnosticoResposta.UltimaHora ultima = new IaDiagnosticoResposta.UltimaHora(0, 0, Map.of());
        if (ativo.isPresent()) {
            MetadadosModelo meta = metadados(ativo.get());
            avisos.addAll(avisos(ativo.get(), meta).stream().filter(a -> !a.startsWith("não roda")).toList());
            ModeloRepository.Resumo r = repositorio.resumoDesde(ativo.get().id(), maquinaId, simulado,
                    relogio.instant().minus(Duration.ofHours(1)));
            Map<String, Long> porClasse = new LinkedHashMap<>();
            r.porClasse().forEach((i, n) -> porClasse.put(i < meta.classes().size() ? meta.classes().get(i) : "?", n));
            ultima = new IaDiagnosticoResposta.UltimaHora(r.total(), r.anomalias(), porClasse);
        } else {
            avisos.add("Nenhum modelo ativo: a segunda opinião não aparece (a regra funciona normalmente).");
        }
        List<IaDiagnosticoResposta.CanalFusao> canais = new ArrayList<>();
        new java.util.TreeMap<>(fusao.canais() == null ? Map.<String, PropriedadesFusao.Canal>of() : fusao.canais())
                .forEach((c, v) -> canais.add(new IaDiagnosticoResposta.CanalFusao(c, v != null && v.habilitado())));
        return new IaDiagnosticoResposta(simulado, ativo.map(this::resumo).orElse(null), CAMINHO,
                carga.map(InferenciaService.Carga::roda).orElse(false), motivo, avisos, inferencias.inferencias(),
                inferencias.erros(), inferencias.ultimoErro(), ultima, canais, tendencia.habilitada(), prop,
                treino.publicas(), fusao, tendencia);
    }

    // ------------------------------------------------------------------ apoio

    private MetadadosModelo metadados(ModeloRepository.Linha m) {
        try {
            return json.readValue(m.metadados(), MetadadosModelo.class);
        } catch (IOException e) {
            throw new IllegalStateException("metadados do modelo " + m.id() + " ilegíveis", e);
        }
    }

    ModeloResumoResposta resumo(ModeloRepository.Linha m) {
        MetadadosModelo meta = metadados(m);
        Double f1 = meta.metricas() != null && meta.metricas().porEnsaio() != null
                && meta.metricas().porEnsaio().classificador() != null
                ? meta.metricas().porEnsaio().classificador().f1Macro() : null;
        return new ModeloResumoResposta(m.id(), m.maquinaId(), m.simulado(), m.versao(), m.estado(), m.criadoEm(),
                m.criadoPor(), m.ativadoEm(), m.ativadoPor(), m.trabalhoId(), m.versaoVetor(), m.referenciaNumero(),
                m.limiar(), meta.classes(), meta.conjunto(), f1, m.tamanhoBytes(),
                m.simulado() ? "dado simulado: não é resultado" : null);
    }

    private void anunciarTreino(TrabalhoTreinoResposta t) {
        anuncios.publishEvent(new TreinoAlterado(t.maquinaId(), t.simulado(), new TreinoEvento.Treino(t)));
    }

    private void exigirMaquina(long maquinaId) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
    }

    @Override
    public void destroy() {
        acordar.shutdownNow();
    }

    /** Anunciado quando um trabalho muda de estado; vira o evento "treino" depois do commit. */
    public record TreinoAlterado(long maquinaId, boolean simulado, TreinoEvento.Treino evento) {
    }

    /** Anunciado quando nasce uma versão candidata ou uma versão é ativada; vira o evento "modelo". */
    public record ModeloAlterado(long maquinaId, boolean simulado, TreinoEvento.Modelo evento) {
    }
}
