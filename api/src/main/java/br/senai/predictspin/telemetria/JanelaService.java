package br.senai.predictspin.telemetria;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.telemetria.dto.JanelaResposta;
import br.senai.predictspin.telemetria.dto.UltimaJanelaResposta;

/**
 * Janelas completas (envio, pontos e canais). Cada página custa um número fixo de consultas: as
 * janelas, a contagem, as telemetrias de todas elas e as leituras de todas elas.
 */
@Service
@Transactional(readOnly = true)
public class JanelaService {

    /** Período padrão quando "de" não é informado. */
    static final Duration PERIODO_PADRAO = Duration.ofHours(24);

    private final JanelaRepository janelas;
    private final TelemetriaRepository telemetrias;
    private final LeituraRepository leituras;
    private final MaquinaRepository maquinas;
    private final EnsaioRepository ensaios;
    private final Clock relogio;
    private final AvaliacoesDasJanelas avaliacoes;

    @org.springframework.beans.factory.annotation.Autowired
    public JanelaService(JanelaRepository janelas, TelemetriaRepository telemetrias, LeituraRepository leituras,
                         MaquinaRepository maquinas, EnsaioRepository ensaios, Clock relogio,
                         AvaliacoesDasJanelas avaliacoes) {
        this.janelas = janelas;
        this.telemetrias = telemetrias;
        this.leituras = leituras;
        this.maquinas = maquinas;
        this.ensaios = ensaios;
        this.relogio = relogio;
        this.avaliacoes = avaliacoes;
    }

    /** Sem avaliação das janelas (testes de unidade). */
    public JanelaService(JanelaRepository janelas, TelemetriaRepository telemetrias, LeituraRepository leituras,
                         MaquinaRepository maquinas, EnsaioRepository ensaios, Clock relogio) {
        this(janelas, telemetrias, leituras, maquinas, ensaios, relogio, AvaliacoesDasJanelas.NENHUMA);
    }

    /** Janelas da máquina entre "de" (inclusivo) e "ate" (exclusivo), na ordem pedida. */
    public Pagina<JanelaResposta> daMaquina(Long maquinaId, Filtro filtro, int pagina, int tamanho) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        Instant fim = filtro.ate() != null ? filtro.ate() : relogio.instant().plusSeconds(1);
        Instant inicio = filtro.de() != null ? filtro.de() : fim.minus(PERIODO_PADRAO);
        if (!inicio.isBefore(fim)) {
            throw new RequisicaoInvalidaException("'de' precisa ser anterior a 'ate'");
        }
        Sort ordem = Sort.by(filtro.crescente() ? Sort.Direction.ASC : Sort.Direction.DESC, "medidoEm");
        Page<Janela> resultado = janelas.daMaquina(maquinaId, inicio, fim, filtro.simulado(), filtro.modo(),
                PageRequest.of(pagina, tamanho, ordem));
        return montarPagina(resultado);
    }

    /** Janelas de um ensaio em ordem crescente de medido_em: é a sequência do replay. */
    public Pagina<JanelaResposta> doEnsaio(Long ensaioId, int pagina, int tamanho) {
        if (!ensaios.existsById(ensaioId)) {
            throw new RecursoNaoEncontradoException("Ensaio " + ensaioId + " não encontrado");
        }
        return montarPagina(janelas.doEnsaio(ensaioId, PageRequest.of(pagina, tamanho)));
    }

    /** Uma janela pelo id, completa; vazio se não existe. Usada pelo fluxo de eventos. */
    public Optional<JanelaResposta> buscar(Long janelaId) {
        return janelas.comDispositivoEEnsaio(janelaId).map(j -> montar(List.of(j)).get(0));
    }

    private Pagina<JanelaResposta> montarPagina(Page<Janela> pagina) {
        return new Pagina<>(montar(pagina.getContent()), pagina.getNumber(), pagina.getSize(),
                pagina.getTotalElements(), pagina.getTotalPages());
    }

    /** Busca pontos e canais de todas as janelas de uma vez e monta as respostas na ordem recebida. */
    private List<JanelaResposta> montar(List<Janela> lista) {
        if (lista.isEmpty()) {
            return List.of();
        }
        List<Long> ids = lista.stream().map(Janela::getId).toList();
        Map<Long, Map<Long, UltimaJanelaResposta.Avaliacao>> avaliadas = avaliacoes.das(ids);
        Map<Long, Map<String, UltimaJanelaResposta.Ponto>> pontos = new HashMap<>();
        for (Telemetria t : telemetrias.dasJanelas(ids)) {
            var p = t.getPonto();
            pontos.computeIfAbsent(t.getJanela().getId(), id -> new LinkedHashMap<>())
                    .put(p.getCodigo(), new UltimaJanelaResposta.Ponto(p.getId(), p.getPapel().valor(),
                            p.getDescricao(), t.getRmsG(), t.getPicoG(), t.getCurtose(), t.getOrdem1x(),
                            t.getOrdem2x(), t.getOrdem3x(), t.getVelRmsMmS(),
                            avaliadas.getOrDefault(t.getJanela().getId(), Map.of()).get(p.getId())));
        }
        Map<Long, Map<String, UltimaJanelaResposta.Canal>> canais = new HashMap<>();
        for (Leitura l : leituras.dasJanelas(ids)) {
            var c = l.getCanal();
            canais.computeIfAbsent(l.getJanela().getId(), id -> new LinkedHashMap<>())
                    .put(c.getCodigo(), new UltimaJanelaResposta.Canal(l.getValor(), c.getUnidade(),
                            c.getGrandeza().valor()));
        }
        List<JanelaResposta> saida = new ArrayList<>(lista.size());
        for (Janela j : lista) {
            Ensaio ensaio = j.getEnsaio();
            saida.add(new JanelaResposta(j.getId(), j.getMedidoEm(), j.getRecebidoEm(), j.getRotacaoRpm(),
                    j.isSaturou(), j.getModo(), j.getAmostras(), j.getAmostrasEsperadas(),
                    j.getDispositivo().isSimulado(), j.getDispositivo().getIdentificador(),
                    ensaio == null ? null : ensaio.getId(), ensaio == null ? null : ensaio.getCodigo(),
                    pontos.getOrDefault(j.getId(), Map.of()), canais.getOrDefault(j.getId(), Map.of())));
        }
        return saida;
    }

    /** Filtros da listagem por máquina; nulo significa "qualquer" (e período padrão). */
    public record Filtro(Instant de, Instant ate, Boolean simulado, ModoJanela modo, boolean crescente) {
    }
}
