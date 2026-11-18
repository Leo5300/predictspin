package br.senai.predictspin.alerta;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.alarme.AvaliacaoService;
import br.senai.predictspin.alarme.AvaliacaoService.PontoProcessado;
import br.senai.predictspin.alarme.AvaliacaoService.ResultadoJanela;
import br.senai.predictspin.alarme.Explicacao;
import br.senai.predictspin.alarme.JanelaAvaliada;
import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.alerta.dto.AlertaDetalheResposta;
import br.senai.predictspin.alerta.dto.AlertaEvento;
import br.senai.predictspin.alerta.dto.AlertaResposta;
import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.referencia.CalculoReferencia;
import br.senai.predictspin.referencia.Medida;

/**
 * Alertas no padrão ISA-18.2. Um alerta de máquina abre quando o ponto ENTRA em ATENÇÃO ou ALARME
 * (depois do atraso) e é atualizado se piorar: não abre um por janela. Alerta de instrumento é outro
 * tipo, com prioridade baixa. Janela fora do ao vivo (fila do dispositivo) nunca abre alerta; se o ponto
 * continua fora do normal, o alerta abre na primeira janela ao vivo.
 */
@Service
public class AlertaService {

    static final String MAQUINA = "maquina";
    static final String INSTRUMENTO = "instrumento";

    private final AlertaSql sql;
    private final PropriedadesAlarme prop;
    private final ApplicationEventPublisher anuncios;
    private final Clock relogio;
    private final Map<Long, AlertaSql.Ponto> pontos = new ConcurrentHashMap<>();
    private final Map<String, String> acoes = new ConcurrentHashMap<>();

    public AlertaService(AlertaSql sql, PropriedadesAlarme prop, ApplicationEventPublisher anuncios, Clock relogio) {
        this.sql = sql;
        this.prop = prop;
        this.anuncios = anuncios;
        this.relogio = relogio;
    }

    // ------------------------------------------------------------------ regra (na transação da ingestão)

    @EventListener
    @Order(1)
    public void aoAvaliar(JanelaAvaliada evento) {
        ResultadoJanela r = evento.resultado();
        long fora = r.pontos().stream().filter(p -> p.resultado() != null && p.resultado().avaliada()
                && p.resultado().zMax() >= prop.zAtencao()).count();
        for (PontoProcessado p : r.pontos()) {
            maquina(r, p, fora == 1);
            instrumento(r, p);
        }
    }

    private void maquina(ResultadoJanela r, PontoProcessado p, boolean soUmFora) {
        Nivel nivel = p.estado().estado();
        boolean voltouAoNormal = p.transicao().mudou() && nivel == Nivel.NORMAL;
        if (nivel == Nivel.NORMAL && !voltouAoNormal) {
            return;
        }
        Instant agora = relogio.instant();
        Optional<AlertaSql.EmAberto> aberto = sql.emAberto(p.pontoId(), MAQUINA, r.janela().simulado());
        if (nivel == Nivel.NORMAL) {
            aberto.filter(a -> a.normalizadoEm() == null).ifPresent(a -> normalizar(r, a, agora));
            return;
        }
        boolean avaliada = p.resultado() != null && p.resultado().avaliada();
        if (aberto.isEmpty()) {
            if (r.janela().aoVivo() && avaliada) {
                abrirDeMaquina(r, p, nivel, soUmFora, agora);
            }
            return;
        }
        AlertaSql.EmAberto a = aberto.get();
        if (!avaliada) {
            return;
        }
        Medida dominante = p.resultado().dominante();
        String acao = acao(MAQUINA, ponto(p.pontoId()).papel(), dominante.valor());
        sql.atualizarMedicao(a.id(), nivel, dominante.valor(), valor(p, dominante), p.resultado().zMax(),
                explicacao(p, soUmFora), acao, agora);
        // voltou a sair do normal durante a supressão: conta como piora do mesmo alerta
        boolean reativou = a.normalizadoEm() != null;
        if (nivel != a.nivel() || reativou) {
            String mudanca = reativou || nivel.acimaDe(a.nivel()) ? "piorou" : "melhorou";
            sql.historico(a.id(), mudanca, a.estado(), nivel, null, null, agora);
            if ("piorou".equals(mudanca)) {
                anunciar(r.janela().maquinaId(), r.janela().simulado(), "piorou", a.id());
            }
        }
    }

    private void abrirDeMaquina(ResultadoJanela r, PontoProcessado p, Nivel nivel, boolean soUmFora, Instant agora) {
        Medida dominante = p.resultado().dominante();
        AlertaSql.Ponto ponto = ponto(p.pontoId());
        long id = sql.inserir(new AlertaSql.Novo(r.janela().maquinaId(), r.janela().janelaId(), p.pontoId(), MAQUINA,
                nivel, dominante.valor(), valor(p, dominante), p.resultado().zMax(), explicacao(p, soUmFora),
                acao(MAQUINA, ponto.papel(), dominante.valor()), ponto.componenteId(), r.versaoId(),
                r.janela().firmwareVersao(), calibracao(r, p), r.janela().ensaioId(),
                r.ensaio() == null ? null : r.ensaio().condicao(), r.janela().simulado(), agora));
        sql.historico(id, "abriu", EstadoAlerta.ATIVO_NAO_RECONHECIDO, nivel, null, condicaoTexto(r), agora);
        anunciar(r.janela().maquinaId(), r.janela().simulado(), "abriu", id);
    }

    private void instrumento(ResultadoJanela r, PontoProcessado p) {
        boolean ativo = p.estado().instrumentoAtivo();
        if (!ativo && !p.instrumento().normalizou()) {
            return;
        }
        Instant agora = relogio.instant();
        Optional<AlertaSql.EmAberto> aberto = sql.emAberto(p.pontoId(), INSTRUMENTO, r.janela().simulado());
        if (!ativo) {
            aberto.filter(a -> a.normalizadoEm() == null).ifPresent(a -> normalizar(r, a, agora));
            return;
        }
        if (aberto.isPresent() || !r.janela().aoVivo()) {
            return;
        }
        String motivo = p.instrumento().motivo() == null ? "condição de instrumento ainda presente"
                : p.instrumento().motivo();
        String texto = "Sensor " + p.ponto() + ": " + motivo + ".";
        double valor = valor(p, Medida.RMS_G);
        long id = sql.inserir(new AlertaSql.Novo(r.janela().maquinaId(), r.janela().janelaId(), p.pontoId(),
                INSTRUMENTO, Nivel.ATENCAO, "instrumento", valor, null, texto,
                acao(INSTRUMENTO, "*", "*").replace("{ponto}", p.ponto()), ponto(p.pontoId()).componenteId(),
                r.versaoId(), r.janela().firmwareVersao(), calibracao(r, p), r.janela().ensaioId(),
                r.ensaio() == null ? null : r.ensaio().condicao(), r.janela().simulado(), agora));
        sql.historico(id, "abriu", EstadoAlerta.ATIVO_NAO_RECONHECIDO, Nivel.ATENCAO, null, motivo, agora);
        anunciar(r.janela().maquinaId(), r.janela().simulado(), "abriu", id);
    }

    /** Voltou ao normal: sem reconhecimento fica "normalizado não reconhecido"; reconhecido, encerra. */
    private void normalizar(ResultadoJanela r, AlertaSql.EmAberto a, Instant agora) {
        sql.normalizar(a.id(), agora);
        EstadoAlerta novo = switch (a.estado()) {
            case ATIVO_NAO_RECONHECIDO -> EstadoAlerta.NORMALIZADO_NAO_RECONHECIDO;
            case ATIVO_RECONHECIDO -> EstadoAlerta.ENCERRADO;
            default -> a.estado();
        };
        if (novo != a.estado()) {
            sql.mudarEstado(a.id(), novo, agora);
        }
        sql.historico(a.id(), "normalizou", novo, a.nivel(), null, null, agora);
        anunciar(r.janela().maquinaId(), r.janela().simulado(), novo == EstadoAlerta.ENCERRADO ? "encerrado"
                : "normalizou", a.id());
    }

    private static double valor(PontoProcessado p, Medida medida) {
        return p.itens().stream().filter(i -> i.medida() == medida).map(Explicacao.Item::valor).findFirst()
                .orElse(0.0);
    }

    /** Explicação do ponto; a dica do sensor só quando ESTE é o único ponto fora do normal. */
    private String explicacao(PontoProcessado p, boolean soUmFora) {
        return Explicacao.texto(p.itens(), soUmFora && p.resultado().zMax() >= prop.zAtencao());
    }

    /** Papel e componente do ponto e textos de ação mudam só por migração: ficam guardados. */
    private AlertaSql.Ponto ponto(long pontoId) {
        return pontos.computeIfAbsent(pontoId, sql::ponto);
    }

    private String acao(String tipo, String papel, String medida) {
        return acoes.computeIfAbsent(tipo + "/" + papel + "/" + medida, k -> sql.acao(tipo, papel, medida));
    }

    private static String calibracao(ResultadoJanela r, PontoProcessado p) {
        return CalculoReferencia.calibracaoDoPonto(r.janela().calibracaoJson(), p.ponto());
    }

    private static String condicaoTexto(ResultadoJanela r) {
        return AvaliacaoService.deCondicao(r.ensaio()) ? "durante ensaio de " + r.ensaio().condicao() : null;
    }

    private void anunciar(Long maquinaId, boolean simulado, String acao, long id) {
        sql.buscar(id).ifPresent(a -> anuncios.publishEvent(new AlertaAlterado(maquinaId, simulado,
                new AlertaEvento(acao, a))));
    }

    // ------------------------------------------------------------------ ações de usuário

    /** "Eu vi": não apaga nem conserta nada. Ativo vira reconhecido; normalizado vira encerrado. */
    @Transactional
    public AlertaResposta reconhecer(long id, long usuarioId) {
        AlertaSql.EmAberto a = travar(id);
        Instant agora = relogio.instant();
        if (a.reconhecidoEm() != null || a.estado() == EstadoAlerta.ENCERRADO) {
            throw new ConflitoException("Alerta " + id + " já foi reconhecido");
        }
        sql.reconhecer(id, usuarioId, agora);
        EstadoAlerta novo = switch (a.estado()) {
            case ATIVO_NAO_RECONHECIDO -> EstadoAlerta.ATIVO_RECONHECIDO;
            case NORMALIZADO_NAO_RECONHECIDO -> EstadoAlerta.ENCERRADO;
            default -> a.estado();
        };
        if (novo != a.estado()) {
            sql.mudarEstado(id, novo, agora);
        }
        sql.historico(id, "reconhecido", novo, a.nivel(), usuarioId, null, agora);
        AlertaResposta resposta = buscar(id);
        anuncios.publishEvent(new AlertaAlterado(resposta.maquinaId(), resposta.simulado(),
                new AlertaEvento(novo == EstadoAlerta.ENCERRADO ? "encerrado" : "reconhecido", resposta)));
        return resposta;
    }

    /** Silencia de propósito, com motivo e prazo (só ADMIN). Vale para alerta ativo. */
    @Transactional
    public AlertaResposta suprimir(long id, long usuarioId, String motivo, int minutos) {
        if (minutos > prop.supressaoMaxMin()) {
            throw new RequisicaoInvalidaException("O prazo da supressão vai até " + prop.supressaoMaxMin()
                    + " minutos (ps.alarme.supressao-max-min)");
        }
        AlertaSql.EmAberto a = travar(id);
        if (a.estado() != EstadoAlerta.ATIVO_NAO_RECONHECIDO && a.estado() != EstadoAlerta.ATIVO_RECONHECIDO) {
            throw new ConflitoException("Só alerta ativo pode ser suprimido (estado atual: " + a.estado().valor() + ")");
        }
        Instant agora = relogio.instant();
        Instant ate = agora.plus(Duration.ofMinutes(minutos));
        sql.suprimir(id, usuarioId, motivo.trim(), ate, agora);
        sql.historico(id, "suprimido", EstadoAlerta.SUPRIMIDO, a.nivel(), usuarioId,
                motivo.trim() + " (até " + ate + ")", agora);
        AlertaResposta resposta = buscar(id);
        anuncios.publishEvent(new AlertaAlterado(resposta.maquinaId(), resposta.simulado(),
                new AlertaEvento("suprimido", resposta)));
        return resposta;
    }

    @Transactional
    public AlertaResposta cancelarSupressao(long id, long usuarioId) {
        AlertaSql.EmAberto a = travar(id);
        if (a.estado() != EstadoAlerta.SUPRIMIDO) {
            throw new ConflitoException("Alerta " + id + " não está suprimido");
        }
        return encerrarSupressao(a, usuarioId, "supressão cancelada");
    }

    /** Fim do prazo: volta sozinho ao estado que teria sem a supressão. */
    @Scheduled(fixedDelayString = "${ps.alarme.verificar-supressao:30s}")
    @Transactional
    public int expirarSupressoes() {
        List<Long> vencidas = sql.supressoesVencidas(relogio.instant());
        for (Long id : vencidas) {
            sql.travar(id).filter(a -> a.estado() == EstadoAlerta.SUPRIMIDO)
                    .ifPresent(a -> encerrarSupressao(a, null, "fim do prazo"));
        }
        return vencidas.size();
    }

    private AlertaResposta encerrarSupressao(AlertaSql.EmAberto a, Long usuarioId, String detalhe) {
        Instant agora = relogio.instant();
        boolean normalizado = a.normalizadoEm() != null;
        boolean reconhecido = a.reconhecidoEm() != null;
        EstadoAlerta novo;
        if (normalizado) {
            novo = reconhecido ? EstadoAlerta.ENCERRADO : EstadoAlerta.NORMALIZADO_NAO_RECONHECIDO;
        } else {
            novo = reconhecido ? EstadoAlerta.ATIVO_RECONHECIDO : EstadoAlerta.ATIVO_NAO_RECONHECIDO;
        }
        sql.mudarEstado(a.id(), novo, agora);
        sql.historico(a.id(), "supressao_encerrada", novo, a.nivel(), usuarioId, detalhe, agora);
        AlertaResposta resposta = buscar(a.id());
        anuncios.publishEvent(new AlertaAlterado(resposta.maquinaId(), resposta.simulado(),
                new AlertaEvento("supressao_encerrada", resposta)));
        return resposta;
    }

    private AlertaSql.EmAberto travar(long id) {
        return sql.travar(id).orElseThrow(() -> new RecursoNaoEncontradoException("Alerta " + id + " não encontrado"));
    }

    // ------------------------------------------------------------------ consultas

    @Transactional(readOnly = true)
    public AlertaResposta buscar(long id) {
        return sql.buscar(id).orElseThrow(() -> new RecursoNaoEncontradoException("Alerta " + id + " não encontrado"));
    }

    @Transactional(readOnly = true)
    public AlertaDetalheResposta detalhe(long id) {
        return new AlertaDetalheResposta(buscar(id), sql.historicoDe(id));
    }

    @Transactional(readOnly = true)
    public Pagina<AlertaResposta> listar(AlertaSql.Filtro filtro, int pagina, int tamanho) {
        long total = sql.contar(filtro);
        return new Pagina<>(sql.listar(filtro, tamanho, (long) pagina * tamanho), pagina, tamanho, total,
                (int) ((total + tamanho - 1) / tamanho));
    }

    /**
     * Indicadores de desempenho do alarme nas últimas {@code indicadores-h} horas (sem os alertas de ensaio
     * de condição); intervalos e contagens vêm de ps.alarme.
     */
    public record Indicadores(double alertasPorHora, long piorDezMinutos, List<String> pontosRepetitivos,
                              long parados, long suprimidos) {
    }

    @Transactional(readOnly = true)
    public Indicadores indicadores(long maquinaId, boolean simulado) {
        Instant agora = relogio.instant();
        Instant desde = agora.minus(Duration.ofHours(prop.indicadoresH()));
        return new Indicadores((double) sql.contarDesde(maquinaId, simulado, desde) / prop.indicadoresH(),
                sql.piorJanela(maquinaId, simulado, desde, prop.rajadaMin()),
                sql.repetitivos(maquinaId, simulado, desde, prop.rajadaMin(), prop.repetitivoVezes()),
                sql.parados(maquinaId, simulado, agora.minus(Duration.ofHours(prop.paradoH()))),
                sql.suprimidos(maquinaId, simulado));
    }
}
