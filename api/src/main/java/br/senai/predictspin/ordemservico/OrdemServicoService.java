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
import br.senai.predictspin.alarme.JanelaAvaliada;
import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.alerta.AlertaSql;
import br.senai.predictspin.alerta.RetornoTecnico;
import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.ordemservico.dto.OrdemServicoEvento;
import br.senai.predictspin.ordemservico.dto.OrdemServicoResposta;
import br.senai.predictspin.referencia.CalculoReferencia;

/**
 * Ordem de serviço. Abre sozinha quando um alerta de MÁQUINA fica em ALARME por {@code alarmeContinuoS}
 * seguidos ou quando a severidade do ponto, somada só enquanto há alerta de máquina ativo, passa de
 * {@code severidadeLimite} desde a última OS do ponto. Toda OS tem alerta de origem. No máximo uma OS aberta
 * por ponto (e tipo de dado). Nunca a partir de janela recuperada, de ensaio de condição, de alerta suprimido
 * nem de alerta de instrumento (que já manda conferir o sensor).
 * O retorno do técnico (confirmada ou rejeitada) fica guardado como rótulo do treino da parte B.
 */
@Service
public class OrdemServicoService {

    static final String ALARME_CONTINUO = "alarme_continuo";
    static final String SEVERIDADE = "severidade";

    private final OrdemServicoSql sql;
    private final AlertaSql alertas;
    private final PropriedadesOs prop;
    private final PropriedadesAlarme propAlarme;
    private final ApplicationEventPublisher anuncios;
    private final Clock relogio;

    public OrdemServicoService(OrdemServicoSql sql, AlertaSql alertas, PropriedadesOs prop,
                               PropriedadesAlarme propAlarme, ApplicationEventPublisher anuncios, Clock relogio) {
        this.sql = sql;
        this.alertas = alertas;
        this.prop = prop;
        this.propAlarme = propAlarme;
        this.anuncios = anuncios;
        this.relogio = relogio;
    }

    // ------------------------------------------------------------------ regra (depois dos alertas)

    /**
     * Regra da OS, ponto a ponto, só em janela que andou o estado do ponto. Tempo de ALARME e severidade que
     * disparam OS só contam em janela AO VIVO, fora de ensaio de condição, com o ponto em ATENÇÃO ou ALARME
     * (depois do atraso) e com alerta de MÁQUINA ativo e não suprimido; fora disso, o tempo de ALARME
     * recomeça. Toda OS aponta o alerta de origem; alerta que já gerou OS não gera outra (V1).
     */
    @EventListener
    @Order(2)
    public void aoAvaliar(JanelaAvaliada evento) {
        ResultadoJanela r = evento.resultado();
        boolean conta = r.janela().aoVivo() && !AvaliacaoService.deCondicao(r.ensaio());
        for (PontoProcessado p : r.pontos()) {
            EstadoPonto e = p.estado();
            if (!r.janela().medidoEm().equals(e.ultimoMedidoEm())) {
                continue; // janela fora de ordem: não mexeu no estado do ponto
            }
            if (!conta || e.estado() == Nivel.NORMAL) {
                e.definirAlarmeAoVivoDesde(null);
                continue;
            }
            avaliarPonto(r, p, e);
        }
    }

    private void avaliarPonto(ResultadoJanela r, PontoProcessado p, EstadoPonto e) {
        boolean simulado = r.janela().simulado();
        Optional<OrdemServicoSql.AlertaAtivo> ativo = sql.alertaAtivo(p.pontoId(), simulado);
        if (ativo.isEmpty()) {
            // sem alerta de máquina ativo (suprimido, ou o ponto só tem alerta de instrumento): nada conta
            e.definirAlarmeAoVivoDesde(null);
            return;
        }
        OrdemServicoSql.AlertaAtivo alerta = ativo.get();
        Instant t = r.janela().medidoEm();
        if (p.resultado() != null && p.resultado().avaliada()) {
            e.somarSeveridade(Math.max(0, p.resultado().zMax() - propAlarme.zAtencao()) * r.duracaoS());
        }
        if (e.estado() == Nivel.ALARME) {
            if (e.alarmeAoVivoDesde() == null) {
                e.definirAlarmeAoVivoDesde(t);
            }
        } else {
            e.definirAlarmeAoVivoDesde(null);
        }
        boolean alarmeContinuo = e.alarmeAoVivoDesde() != null
                && segundos(e.alarmeAoVivoDesde(), t) + r.duracaoS() >= prop.alarmeContinuoS() - 1e-9;
        boolean severidade = e.severidadeDesdeOs() > prop.severidadeLimite();
        if ((!alarmeContinuo && !severidade) || alerta.temOs() || sql.temAberta(p.pontoId(), simulado)) {
            return;
        }
        String explicacao = alerta.explicacao() != null ? alerta.explicacao()
                : String.format(java.util.Locale.forLanguageTag("pt-BR"),
                        "Severidade acumulada de %.0f z·s desde a última OS do ponto %s.", e.severidadeDesdeOs(),
                        p.ponto());
        AlertaSql.Ponto ponto = alertas.ponto(p.pontoId());
        Optional<Long> id = sql.inserir(new OrdemServicoSql.Nova(r.janela().maquinaId(), p.pontoId(),
                ponto.componenteId(), alerta.id(), alarmeContinuo ? ALARME_CONTINUO : SEVERIDADE, explicacao,
                alerta.acao(), e.severidadeDesdeOs(), r.versaoId(), r.janela().firmwareVersao(),
                CalculoReferencia.calibracaoDoPonto(r.janela().calibracaoJson(), p.ponto()), simulado,
                relogio.instant()));
        if (id.isPresent()) {
            e.zerarSeveridade();
            anunciar("aberta", buscar(id.get()));
        }
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

    /** Conclui com o retorno do técnico e, opcionalmente, a condição encontrada (rótulo do próximo treino). */
    @Transactional
    public OrdemServicoResposta concluir(long id, long usuarioId, RetornoTecnico retorno, String comentario,
                                         CondicaoEncontrada condicao) {
        StatusOrdemServico status = travar(id);
        if (status != StatusOrdemServico.ABERTA && status != StatusOrdemServico.EM_ANDAMENTO) {
            throw new ConflitoException("OS " + id + " já está " + status.valor());
        }
        sql.concluir(id, usuarioId, retorno, comentario == null || comentario.isBlank() ? null : comentario.trim(),
                condicao, relogio.instant());
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
