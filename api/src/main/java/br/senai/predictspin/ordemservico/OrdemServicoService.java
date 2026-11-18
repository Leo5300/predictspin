package br.senai.predictspin.ordemservico;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.alarme.AvaliacaoService;
import br.senai.predictspin.alarme.AvaliacaoService.PontoProcessado;
import br.senai.predictspin.alarme.AvaliacaoService.ResultadoJanela;
import br.senai.predictspin.alarme.EstadoPonto;
import br.senai.predictspin.alarme.Explicacao;
import br.senai.predictspin.alarme.JanelaAvaliada;
import br.senai.predictspin.alerta.AlertaSql;
import br.senai.predictspin.alerta.RetornoTecnico;
import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.ordemservico.dto.OrdemServicoEvento;
import br.senai.predictspin.ordemservico.dto.OrdemServicoResposta;
import br.senai.predictspin.referencia.CalculoReferencia;
import br.senai.predictspin.referencia.Medida;

/**
 * Ordem de serviço. Abre sozinha quando um alerta de MÁQUINA fica em ALARME por {@code alarmeContinuoS}
 * seguidos ou quando a severidade acumulada do ponto passa de {@code severidadeLimite} desde a última OS
 * do ponto. No máximo uma OS aberta por ponto (e tipo de dado). Nunca a partir de janela fora do ao vivo,
 * de ensaio de condição, de alerta suprimido nem de alerta de instrumento (que já manda conferir o sensor).
 * O retorno do técnico (confirmada ou rejeitada) fica guardado como rótulo do treino da parte B.
 */
@Service
public class OrdemServicoService {

    static final String ALARME_CONTINUO = "alarme_continuo";
    static final String SEVERIDADE = "severidade";

    private final OrdemServicoSql sql;
    private final AlertaSql alertas;
    private final PropriedadesOs prop;
    private final ApplicationEventPublisher anuncios;
    private final Clock relogio;

    public OrdemServicoService(OrdemServicoSql sql, AlertaSql alertas, PropriedadesOs prop,
                               ApplicationEventPublisher anuncios, Clock relogio) {
        this.sql = sql;
        this.alertas = alertas;
        this.prop = prop;
        this.anuncios = anuncios;
        this.relogio = relogio;
    }

    // ------------------------------------------------------------------ regra (depois dos alertas)

    @EventListener
    @Order(2)
    public void aoAvaliar(JanelaAvaliada evento) {
        ResultadoJanela r = evento.resultado();
        if (!r.janela().aoVivo() || AvaliacaoService.deCondicao(r.ensaio())) {
            return;
        }
        for (PontoProcessado p : r.pontos()) {
            avaliarPonto(r, p);
        }
    }

    private void avaliarPonto(ResultadoJanela r, PontoProcessado p) {
        EstadoPonto e = p.estado();
        boolean alarmeContinuo = e.emAlarmeDesde() != null && segundos(e.emAlarmeDesde(), r.janela().medidoEm())
                + r.duracaoS() >= prop.alarmeContinuoS() - 1e-9;
        boolean severidade = e.severidadeDesdeOs() > prop.severidadeLimite();
        if (!alarmeContinuo && !severidade) {
            return;
        }
        boolean simulado = r.janela().simulado();
        if (sql.temAberta(p.pontoId(), simulado)) {
            return;
        }
        Optional<OrdemServicoSql.AlertaAtivo> alerta = sql.alertaAtivo(p.pontoId(), simulado);
        if (!severidade && alerta.isEmpty()) {
            // ALARME seguido, mas o alerta está suprimido ou já gerou a sua OS
            return;
        }
        String motivo = alarmeContinuo && alerta.isPresent() ? ALARME_CONTINUO : SEVERIDADE;
        AlertaSql.Ponto ponto = alertas.ponto(p.pontoId());
        String explicacao = alerta.map(OrdemServicoSql.AlertaAtivo::explicacao)
                .orElseGet(() -> Explicacao.texto(p.itens(), false));
        if (explicacao == null) {
            explicacao = String.format(java.util.Locale.forLanguageTag("pt-BR"),
                    "Severidade acumulada de %.0f z·s desde a última OS do ponto %s.", e.severidadeDesdeOs(),
                    p.ponto());
        }
        String acao = alerta.map(OrdemServicoSql.AlertaAtivo::acao).orElseGet(() -> alertas.acao("maquina",
                ponto.papel(), dominante(p).valor()));
        Instant agora = relogio.instant();
        Optional<Long> id = sql.inserir(new OrdemServicoSql.Nova(r.janela().maquinaId(), p.pontoId(),
                ponto.componenteId(), alerta.map(OrdemServicoSql.AlertaAtivo::id).orElse(null), motivo, explicacao,
                acao, e.severidadeDesdeOs(), r.versaoId(), r.janela().firmwareVersao(),
                CalculoReferencia.calibracaoDoPonto(r.janela().calibracaoJson(), p.ponto()), simulado, agora));
        if (id.isPresent()) {
            e.zerarSeveridade();
            anunciar("aberta", buscar(id.get()));
        }
    }

    private static Medida dominante(PontoProcessado p) {
        return p.resultado() != null && p.resultado().dominante() != null ? p.resultado().dominante() : Medida.RMS_G;
    }

    private static double segundos(Instant de, Instant ate) {
        return Duration.between(de, ate).toNanos() / 1e9;
    }

    // ------------------------------------------------------------------ ações do técnico

    @Transactional
    public OrdemServicoResposta assumir(long id, long usuarioId) {
        StatusOrdemServico status = travar(id);
        if (status != StatusOrdemServico.ABERTA) {
            throw new ConflitoException("Só OS aberta pode ser assumida (status atual: " + status.valor() + ")");
        }
        sql.assumir(id, usuarioId, relogio.instant());
        OrdemServicoResposta os = buscar(id);
        anunciar("assumida", os);
        return os;
    }

    @Transactional
    public OrdemServicoResposta concluir(long id, long usuarioId, RetornoTecnico retorno, String comentario) {
        StatusOrdemServico status = travar(id);
        if (status != StatusOrdemServico.ABERTA && status != StatusOrdemServico.EM_ANDAMENTO) {
            throw new ConflitoException("OS " + id + " já está " + status.valor());
        }
        sql.concluir(id, usuarioId, retorno, comentario == null || comentario.isBlank() ? null : comentario.trim(),
                relogio.instant());
        OrdemServicoResposta os = buscar(id);
        anunciar("concluida", os);
        return os;
    }

    private StatusOrdemServico travar(long id) {
        return sql.travar(id).orElseThrow(() -> new RecursoNaoEncontradoException("OS " + id + " não encontrada"));
    }

    private void anunciar(String acao, OrdemServicoResposta os) {
        anuncios.publishEvent(new OrdemServicoAlterada(os.maquinaId(), os.simulado(),
                new OrdemServicoEvento(acao, os)));
    }

    // ------------------------------------------------------------------ consultas

    @Transactional(readOnly = true)
    public OrdemServicoResposta buscar(long id) {
        return sql.buscar(id).orElseThrow(() -> new RecursoNaoEncontradoException("OS " + id + " não encontrada"));
    }

    @Transactional(readOnly = true)
    public Pagina<OrdemServicoResposta> listar(OrdemServicoSql.Filtro filtro, int pagina, int tamanho) {
        long total = sql.contar(filtro);
        return new Pagina<>(sql.listar(filtro, tamanho, (long) pagina * tamanho), pagina, tamanho, total,
                (int) ((total + tamanho - 1) / tamanho));
    }
}
