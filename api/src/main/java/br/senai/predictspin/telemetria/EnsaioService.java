package br.senai.predictspin.telemetria;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;

import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.DispositivoRepository;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.telemetria.dto.CoberturaResposta;
import br.senai.predictspin.telemetria.dto.EnsaioResposta;
import br.senai.predictspin.telemetria.dto.NovoEnsaioRequisicao;
import br.senai.predictspin.telemetria.dto.ResumoEnsaioResposta;

/**
 * Coleta rotulada: abrir, encerrar e descartar ensaios, resumo e cobertura. Regras:
 * <ul>
 *   <li>um ensaio aberto por máquina (o segundo responde 409);</li>
 *   <li>o código é gerado pela API: &lt;máquina&gt;-&lt;etapa&gt;-&lt;sequencial&gt;;</li>
 *   <li>o ensaio é simulado se o pedido disser, ou se a máquina só tiver dispositivo simulado ativo;</li>
 *   <li>descartar marca e encerra, não apaga.</li>
 * </ul>
 */
@Service
public class EnsaioService {

    private final EnsaioRepository ensaios;
    private final JanelaRepository janelas;
    private final MaquinaRepository maquinas;
    private final DispositivoRepository dispositivos;
    private final Clock relogio;

    public EnsaioService(EnsaioRepository ensaios, JanelaRepository janelas, MaquinaRepository maquinas,
                         DispositivoRepository dispositivos, Clock relogio) {
        this.ensaios = ensaios;
        this.janelas = janelas;
        this.maquinas = maquinas;
        this.dispositivos = dispositivos;
        this.relogio = relogio;
    }

    @Transactional
    public EnsaioResposta abrir(Long maquinaId, NovoEnsaioRequisicao req) {
        Maquina maquina = maquinas.findById(maquinaId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada"));
        ensaios.aberto(maquinaId).ifPresent(aberto -> {
            throw new ConflitoException("A máquina já tem o ensaio " + aberto.getCodigo()
                    + " aberto. Encerre ou descarte antes de abrir outro.");
        });
        boolean simulado = Boolean.TRUE.equals(req.simulado()) || somenteSimuladosAtivos(maquinaId);
        String codigo = String.format("%s-%s-%05d", maquina.getCodigo(), req.etapa(), ensaios.proximoNumero());
        Ensaio ensaio = new Ensaio(maquina, codigo, req.etapa(), req.condicao(), vazioParaNulo(req.material()),
                req.rotacaoAlvoRpm(), req.avancoAlvo(), Objects.requireNonNullElse(req.repeticao(), 1),
                vazioParaNulo(req.observacao()), simulado, relogio.instant());
        // flush imediato: se outra requisição abriu ensaio ao mesmo tempo, o índice único responde 409 aqui
        return EnsaioResposta.de(ensaios.saveAndFlush(ensaio));
    }

    @Transactional
    public EnsaioResposta encerrar(Long ensaioId) {
        Ensaio ensaio = exigir(ensaioId);
        if (!ensaio.isAberto()) {
            throw new ConflitoException("O ensaio " + ensaio.getCodigo() + " já está encerrado");
        }
        ensaio.encerrar(relogio.instant());
        return EnsaioResposta.de(ensaio);
    }

    @Transactional
    public EnsaioResposta descartar(Long ensaioId) {
        Ensaio ensaio = exigir(ensaioId);
        if (ensaio.isDescartado()) {
            throw new ConflitoException("O ensaio " + ensaio.getCodigo() + " já está descartado");
        }
        ensaio.descartar(relogio.instant());
        return EnsaioResposta.de(ensaio);
    }

    @Transactional(readOnly = true)
    public EnsaioResposta buscar(Long ensaioId) {
        return EnsaioResposta.de(exigir(ensaioId));
    }

    @Transactional(readOnly = true)
    public Pagina<EnsaioResposta> listar(Long maquinaId, Filtro filtro, Pageable pageable) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        return Pagina.de(ensaios.filtrar(maquinaId, filtro.etapa(), filtro.condicao(), filtro.simulado(),
                filtro.descartado(), filtro.aberto(), pageable), EnsaioResposta::de);
    }

    @Transactional(readOnly = true)
    public ResumoEnsaioResposta resumo(Long ensaioId) {
        Ensaio e = exigir(ensaioId);
        JanelaRepository.ResumoJanelas r = janelas.resumoDoEnsaio(ensaioId);
        Instant fim = e.isAberto() ? relogio.instant() : e.getEncerradoEm();
        long duracao = Math.max(0, Duration.between(e.getIniciadoEm(), fim).toSeconds());
        long total = r.getJanelas() == null ? 0 : r.getJanelas();
        long saturadas = r.getSaturadas() == null ? 0 : r.getSaturadas().longValue();
        return new ResumoEnsaioResposta(e.getId(), e.getCodigo(), e.isAberto(), e.isDescartado(), e.isSimulado(),
                e.getIniciadoEm(), e.getEncerradoEm(), duracao, total, saturadas, r.getRotacaoMedia(),
                r.getPrimeira(), r.getUltima());
    }

    /**
     * Grade etapa × condição × rotação com a contagem de ensaios válidos e quanto falta para a meta.
     * Sem rotações informadas, usa as rotações alvo já usadas em ensaios da máquina.
     */
    @Transactional(readOnly = true)
    public CoberturaResposta cobertura(Long maquinaId, Boolean simulado, int meta, List<Integer> rotacoes) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        List<Integer> grade = new ArrayList<>(new TreeSet<>(rotacoes == null || rotacoes.isEmpty()
                ? ensaios.rotacoesUsadas(maquinaId, simulado)
                : rotacoes));

        Map<String, Long> contagem = new HashMap<>();
        for (EnsaioRepository.LinhaCobertura linha : ensaios.cobertura(maquinaId, simulado)) {
            contagem.put(chave(linha.getEtapa(), linha.getCondicao(), linha.getRotacaoAlvoRpm()), linha.getQuantidade());
        }

        List<CoberturaResposta.Item> itens = new ArrayList<>();
        long validos = 0;
        long faltantes = 0;
        int completas = 0;
        for (Etapa etapa : Etapa.values()) {
            for (Condicao condicao : Condicao.values()) {
                for (Integer rotacao : grade) {
                    long qtd = contagem.getOrDefault(chave(etapa, condicao, rotacao), 0L);
                    long falta = Math.max(0, meta - qtd);
                    itens.add(new CoberturaResposta.Item(etapa, condicao, condicao.uso(), rotacao, qtd, falta));
                    validos += qtd;
                    faltantes += falta;
                    if (falta == 0) {
                        completas++;
                    }
                }
            }
        }
        return new CoberturaResposta(maquinaId, simulado, meta, grade, itens.size(), completas, validos, faltantes,
                itens);
    }

    private boolean somenteSimuladosAtivos(Long maquinaId) {
        return dispositivos.contarAtivos(maquinaId) > 0 && dispositivos.contarReaisAtivos(maquinaId) == 0;
    }

    private Ensaio exigir(Long ensaioId) {
        return ensaios.findById(ensaioId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Ensaio " + ensaioId + " não encontrado"));
    }

    private static String chave(Etapa etapa, Condicao condicao, Integer rotacao) {
        return etapa + "|" + condicao + "|" + rotacao;
    }

    private static String vazioParaNulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.trim();
    }

    /** Filtros opcionais da listagem; nulo significa "qualquer". */
    public record Filtro(Etapa etapa, Condicao condicao, Boolean simulado, Boolean descartado, Boolean aberto) {
    }
}
