package br.senai.predictspin.referencia;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.comum.CodigoId;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;
import br.senai.predictspin.referencia.ReferenciaRepository.VersaoGravada;
import br.senai.predictspin.referencia.dto.CelulaReferenciaResposta;
import br.senai.predictspin.referencia.dto.ReferenciaResposta;
import br.senai.predictspin.referencia.dto.VersaoReferenciaResposta;

/**
 * Referência aprendida: recálculo (versão nova e imutável; a anterior fica guardada), consulta com
 * cobertura e a versão em uso, guardada em memória por máquina e tipo de dado até o próximo recálculo.
 */
@Service
public class ReferenciaService {

    private record ChaveCache(long maquinaId, boolean simulado) {
    }

    private final ReferenciaRepository repositorio;
    private final MaquinaRepository maquinas;
    private final PontoMedicaoRepository pontos;
    private final PropriedadesReferencia propriedades;
    private final ObjectMapper json;
    private final Clock relogio;
    private final Map<ChaveCache, Optional<ReferenciaAtiva>> cache = new ConcurrentHashMap<>();
    /** Janela de deriva só entra com z abaixo do limite de ATENÇÃO em todas as medidas (z negativo entra). */
    private final double zAtencao;

    public ReferenciaService(ReferenciaRepository repositorio, MaquinaRepository maquinas,
                             PontoMedicaoRepository pontos, PropriedadesReferencia propriedades, ObjectMapper json,
                             Clock relogio, @Value("${ps.alarme.z-atencao:3}") double zAtencao) {
        this.repositorio = repositorio;
        this.maquinas = maquinas;
        this.pontos = pontos;
        this.propriedades = propriedades;
        this.json = json;
        this.relogio = relogio;
        this.zAtencao = zAtencao;
    }

    /** Calcula e grava uma versão nova a partir dos ensaios "normal" (e da deriva, se ligada). */
    @Transactional
    public VersaoReferenciaResposta recalcular(Long maquinaId, boolean simulado, Long autorId) {
        Maquina maquina = maquina(maquinaId);
        Instant agora = relogio.instant();
        List<ReferenciaRepository.LinhaJanela> deriva = propriedades.deriva().habilitada()
                ? repositorio.janelasDeDeriva(maquinaId, simulado,
                        agora.minus(Duration.ofDays(propriedades.deriva().dias())), zAtencao)
                : List.of();
        CalculoReferencia.Resultado resultado = CalculoReferencia.calcular(
                repositorio.janelasDeEnsaios(maquinaId, simulado), deriva, maquina.getRotacoesNominaisRpm(),
                propriedades);

        Map<String, Integer> excluidas = new LinkedHashMap<>();
        resultado.excluidas().forEach((motivo, n) -> excluidas.put(motivo.valor(), n));
        long versaoId = repositorio.inserirVersao(maquinaId, simulado, repositorio.proximoNumero(maquinaId, simulado),
                agora, autorId, resultado.janelasUsadas(), resultado.janelasDeriva(), escrever(excluidas),
                escrever(propriedades));
        repositorio.inserirCelulas(versaoId, resultado.celulas());
        esquecerDepoisDoCommit(new ChaveCache(maquinaId, simulado));
        return resposta(repositorio.versaoAtiva(maquinaId, simulado)
                .orElseThrow(() -> new IllegalStateException("Versão recém-gravada não encontrada")));
    }

    /** Versão em uso, células e cobertura por marcha e etapa. */
    @Transactional(readOnly = true)
    public ReferenciaResposta consultar(Long maquinaId, boolean simulado) {
        Maquina maquina = maquina(maquinaId);
        Optional<VersaoGravada> versao = repositorio.versaoAtiva(maquinaId, simulado);
        List<CelulaGravada> celulas = versao.map(v -> repositorio.celulas(v.id())).orElse(List.of());
        List<CelulaReferenciaResposta> respostas = celulas.stream().map(ReferenciaService::resposta).toList();
        boolean pisoMedido = celulas.stream().anyMatch(c -> c.pisoRuido() != null);
        return new ReferenciaResposta(simulado, versao.map(this::resposta).orElse(null), pisoMedido, respostas,
                cobertura(maquina, celulas));
    }

    @Transactional(readOnly = true)
    public Pagina<VersaoReferenciaResposta> versoes(Long maquinaId, boolean simulado, int pagina, int tamanho) {
        maquina(maquinaId);
        long total = repositorio.contarVersoes(maquinaId, simulado);
        List<VersaoReferenciaResposta> conteudo = repositorio
                .versoes(maquinaId, simulado, tamanho, (long) pagina * tamanho).stream().map(this::resposta).toList();
        return new Pagina<>(conteudo, pagina, tamanho, total, (int) ((total + tamanho - 1) / tamanho));
    }

    /** Versão em uso para avaliar janelas; vazia quando nunca foi calculada. */
    public Optional<ReferenciaAtiva> ativa(long maquinaId, boolean simulado) {
        return cache.computeIfAbsent(new ChaveCache(maquinaId, simulado), chave -> repositorio
                .versaoAtiva(maquinaId, simulado)
                .map(v -> new ReferenciaAtiva(v.id(), v.numero(), repositorio.celulas(v.id()))));
    }

    /** Esquece todas as versões em memória (testes que apagam o banco). */
    public void esquecer() {
        cache.clear();
    }

    private void esquecerDepoisDoCommit(ChaveCache chave) {
        cache.remove(chave);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    cache.remove(chave);
                }
            });
        }
    }

    /**
     * Cobertura pelo RMS de todos os pontos ativos: T0 na marcha 0 e, para cada marcha do plano de coleta
     * ou com célula, T1 e T3 (genérica).
     */
    private List<ReferenciaResposta.Cobertura> cobertura(Maquina maquina, List<CelulaGravada> celulas) {
        List<Long> ativos = pontos.codigosAtivos(maquina.getId()).stream().map(CodigoId::getId).toList();
        TreeSet<Integer> marchas = new TreeSet<>(maquina.getRotacoesColetaRpm());
        celulas.stream().filter(c -> c.marchaRpm() > 0).forEach(c -> marchas.add(c.marchaRpm()));
        List<ReferenciaResposta.Cobertura> linhas = new ArrayList<>();
        linhas.add(new ReferenciaResposta.Cobertura(0, "T0", situacao(celulas, ativos, 0, "T0")));
        for (int marcha : marchas) {
            for (String etapa : List.of("T1", "T3")) {
                linhas.add(new ReferenciaResposta.Cobertura(marcha, etapa, situacao(celulas, ativos, marcha, etapa)));
            }
        }
        return linhas;
    }

    private static String situacao(List<CelulaGravada> celulas, List<Long> pontosAtivos, int marcha, String etapa) {
        List<CelulaGravada> rms = celulas.stream()
                .filter(c -> c.medida() == Medida.RMS_G && !c.porReceita() && c.marchaRpm() == marcha
                        && c.etapa().equals(etapa))
                .toList();
        if (rms.isEmpty()) {
            return "sem";
        }
        boolean todos = pontosAtivos.stream()
                .allMatch(p -> rms.stream().anyMatch(c -> c.pontoId() == p && c.suficiente()));
        return todos ? "com" : "insuficiente";
    }

    private Maquina maquina(Long id) {
        return maquinas.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Máquina " + id + " não encontrada"));
    }

    private VersaoReferenciaResposta resposta(VersaoGravada v) {
        return new VersaoReferenciaResposta(v.id(), v.numero(), v.simulado(), v.criadaEm(), v.autor(),
                v.janelasUsadas(), v.janelasDeriva(), ler(v.excluidasJson()), v.celulas(), v.suficientes());
    }

    private static CelulaReferenciaResposta resposta(CelulaGravada c) {
        return new CelulaReferenciaResposta(c.ponto(), c.medida(), c.marchaRpm(), c.etapa(), c.porReceita(),
                c.materialId(), c.ferramentaId(), c.n(), c.nDeriva(), c.mediana(), c.sigma(), c.p95(), c.pisoRuido(),
                c.sigmaEfetivo(), c.suficiente(), c.calibracao(), c.firmwareVersoes());
    }

    private String escrever(Object valor) {
        try {
            return json.writeValueAsString(valor);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Falha ao gravar JSON da referência", e);
        }
    }

    private Map<String, Integer> ler(String texto) {
        try {
            return json.readValue(texto, new TypeReference<LinkedHashMap<String, Integer>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON de exclusões inválido", e);
        }
    }
}
