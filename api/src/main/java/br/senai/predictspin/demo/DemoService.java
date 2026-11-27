package br.senai.predictspin.demo;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import br.senai.predictspin.alarme.AvaliacaoRepository;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.comum.CodigoId;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.demo.dto.EstadoDemoResposta;
import br.senai.predictspin.maquina.Dispositivo;
import br.senai.predictspin.maquina.DispositivoRepository;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.referencia.FiltroQualidade;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaService;
import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.JanelaRecebida;
import br.senai.predictspin.telemetria.RecepcaoTelemetriaService;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;

/**
 * Gerador da barra de demonstração (docs/demo.md). Com {@code ps.demo.habilitado}, e com um nível diferente de
 * PARADA, entrega uma janela simulada a cada {@code ps.demo.janela-s} ao MESMO serviço que o POST /telemetria
 * usa (filtro, avaliação, alerta, OS, fluxo ao vivo), por chamada de serviço, como o dispositivo simulado
 * ps-sim-01. A janela sai marcada como de demonstração e sem ensaio: nunca entra na referência, no treino nem
 * na deriva.
 * <ul>
 *   <li>O estado vive em memória; reiniciar a API volta a PARADA.</li>
 *   <li>ATENÇÃO e ALARME voltam sozinhos a NORMAL depois de {@code volta-normal-s}; o gerador para sozinho
 *       depois de {@code parar-min} sem um novo comando.</li>
 *   <li>Janela de dispositivo REAL nos últimos 60 s pausa o gerador: dado simulado nunca disputa o painel com o
 *       torno de verdade.</li>
 *   <li>Sem referência ativa suficiente na marcha da demonstração, não gera nada e diz o que falta: o gerador
 *       nunca inventa referência.</li>
 * </ul>
 */
@Service
public class DemoService {

    private static final Logger log = LoggerFactory.getLogger(DemoService.class);

    /** Janela real mais recente que isto pausa a demonstração. */
    static final Duration LIMITE_HARDWARE_REAL = Duration.ofSeconds(60);

    private final PropriedadesDemo propriedades;
    private final PropriedadesAlarme limites;
    private final Clock relogio;
    private final ReferenciaService referencias;
    private final RecepcaoTelemetriaService recepcao;
    private final DispositivoRepository dispositivos;
    private final PontoMedicaoRepository pontos;
    private final AvaliacaoRepository avaliacoes;
    private final Random sorteio;

    private NivelDemo nivel = NivelDemo.PARADA;
    private Instant nivelDesde;
    private Instant ultimoComando;
    private Instant proximaJanela;
    private String avisoAutomatico;
    private long falhas;
    private volatile Instant ultimaJanelaReal;

    public DemoService(PropriedadesDemo propriedades, PropriedadesAlarme limites, Clock relogio,
                       ReferenciaService referencias, RecepcaoTelemetriaService recepcao,
                       DispositivoRepository dispositivos, PontoMedicaoRepository pontos,
                       AvaliacaoRepository avaliacoes) {
        this.propriedades = propriedades;
        this.limites = limites;
        this.relogio = relogio;
        this.referencias = referencias;
        this.recepcao = recepcao;
        this.dispositivos = dispositivos;
        this.pontos = pontos;
        this.avaliacoes = avaliacoes;
        this.sorteio = new Random(propriedades.semente());
    }

    public boolean habilitado() {
        return propriedades.habilitado();
    }

    /** Janela de dispositivo real: o gerador pausa enquanto o torno de verdade estiver enviando. */
    @EventListener
    void aoReceber(JanelaRecebida janela) {
        if (!janela.simulado()) {
            ultimaJanelaReal = relogio.instant();
        }
    }

    /** Estado atual; aplica antes a volta a NORMAL e a parada automáticas, para a resposta nunca ficar atrasada. */
    public synchronized EstadoDemoResposta estado() {
        exigirHabilitado();
        Instant agora = relogio.instant();
        aplicarPrazos(agora);
        return montarEstado(agora, contexto());
    }

    /**
     * Troca o nível. Sem referência suficiente o gerador não liga: o nível fica PARADA e a resposta diz o que
     * falta. Os outros avisos (hardware real) não impedem a troca.
     */
    public synchronized EstadoDemoResposta definir(NivelDemo novo, String usuario) {
        exigirHabilitado();
        Instant agora = relogio.instant();
        aplicarPrazos(agora);
        Contexto contexto = contexto();
        if (novo != NivelDemo.PARADA && !contexto.faltas().isEmpty()) {
            nivel = NivelDemo.PARADA;
            log.warn("Demonstração: nível {} pedido por {} não iniciou, falta referência: {}", novo, usuario,
                    contexto.faltas());
        } else {
            nivel = novo;
            nivelDesde = agora;
            ultimoComando = agora;
            proximaJanela = agora;
            avisoAutomatico = null;
            log.info("Demonstração: nível {} definido por {}", novo, usuario);
        }
        return montarEstado(agora, contexto);
    }

    /** Chamado de tempos em tempos: aplica os prazos e envia a janela, se for a hora. */
    @Scheduled(initialDelayString = "${ps.demo.passo-ms:500}", fixedDelayString = "${ps.demo.passo-ms:500}")
    void passo() {
        if (!propriedades.habilitado()) {
            return;
        }
        try {
            tick();
        } catch (RuntimeException e) {
            falhas++;
            log.warn("Demonstração: falha ao gerar a janela (a próxima tentativa segue no prazo)", e);
        }
    }

    synchronized void tick() {
        Instant agora = relogio.instant();
        aplicarPrazos(agora);
        if (nivel == NivelDemo.PARADA || hardwareRealAtivo(agora) || agora.isBefore(proximaJanela)) {
            return;
        }
        proximaJanela = agora.plusSeconds(propriedades.janelaS());
        emitir(agora);
    }

    /** Envia uma janela do nível atual com este medido_em. Sem referência suficiente, não envia nada. */
    synchronized boolean emitir(Instant medidoEm) {
        Contexto contexto = contexto();
        if (contexto.dispositivo() == null || !contexto.faltas().isEmpty() || nivel == NivelDemo.PARADA) {
            return false;
        }
        TelemetriaRequisicao requisicao = GeradorDeJanela.montar(propriedades.dispositivo(),
                medidoEm.truncatedTo(ChronoUnit.MICROS), nivel, contexto.referencia(), contexto.pontos(),
                contexto.marcha(), propriedades.rotacaoRpm(), limites, sorteio, null);
        recepcao.receber(contexto.dispositivo(), requisicao, true);
        return true;
    }

    /** Janelas que o gerador não conseguiu enviar desde que a API subiu. */
    public synchronized long falhas() {
        return falhas;
    }

    // ------------------------------------------------------------------ prazos e estado

    private void aplicarPrazos(Instant agora) {
        if (nivel != NivelDemo.PARADA && !agora.isBefore(ultimoComando.plus(Duration.ofMinutes(propriedades.pararMin())))) {
            log.info("Demonstração: parou sozinha depois de {} min sem comando (estava em {})",
                    propriedades.pararMin(), nivel);
            nivel = NivelDemo.PARADA;
            avisoAutomatico = "A demonstração parou sozinha depois de " + propriedades.pararMin()
                    + " min sem comando.";
        } else if (nivel.volta() && !agora.isBefore(nivelDesde.plusSeconds(propriedades.voltaNormalS()))) {
            log.info("Demonstração: {} voltou sozinho a NORMAL depois de {} s", nivel, propriedades.voltaNormalS());
            avisoAutomatico = nivel == NivelDemo.ALARME
                    ? "O ALARME simulado voltou sozinho a NORMAL depois de " + minutos(propriedades.voltaNormalS()) + "."
                    : "A ATENÇÃO simulada voltou sozinha a NORMAL depois de " + minutos(propriedades.voltaNormalS()) + ".";
            nivel = NivelDemo.NORMAL;
            nivelDesde = agora;
            proximaJanela = agora;
        }
    }

    private static String minutos(int segundos) {
        return segundos % 60 == 0 ? segundos / 60 + " min" : segundos + " s";
    }

    private boolean hardwareRealAtivo(Instant agora) {
        Instant ultima = ultimaJanelaReal;
        return ultima != null && Duration.between(ultima, agora).compareTo(LIMITE_HARDWARE_REAL) < 0;
    }

    private EstadoDemoResposta montarEstado(Instant agora, Contexto contexto) {
        boolean real = hardwareRealAtivo(agora);
        boolean referenciaOk = contexto.faltas().isEmpty();
        Long volta = null;
        if (nivel.volta()) {
            long restante = Duration.between(agora, nivelDesde.plusSeconds(propriedades.voltaNormalS())).toMillis();
            volta = Math.max(0, (restante + 999) / 1000);
        }
        String mensagem;
        if (!referenciaOk) {
            mensagem = contexto.dispositivo() == null
                    ? "Não encontrei o dispositivo simulado " + propriedades.dispositivo() + "."
                    : "Sem referência simulada ativa para " + propriedades.rotacaoRpm()
                            + " rpm: não há como gerar a demonstração. Falta: "
                            + contexto.faltas().stream().collect(Collectors.joining("; ")) + ".";
        } else if (real) {
            mensagem = "Hardware real enviando: a demonstração está em pausa até o torno ficar 60 s sem enviar.";
        } else if (avisoAutomatico != null) {
            mensagem = avisoAutomatico;
        } else {
            mensagem = descricao(nivel);
        }
        return new EstadoDemoResposta(true, nivel, volta, referenciaOk, real, mensagem);
    }

    private String descricao(NivelDemo n) {
        String rpm = propriedades.rotacaoRpm() + " rpm";
        return switch (n) {
            case PARADA -> "Demonstração parada: nenhuma janela simulada está sendo gerada.";
            case NORMAL -> "Gerando janelas simuladas NORMAL a " + rpm + ": A, B e C dentro da referência.";
            case ATENCAO -> "Gerando janelas simuladas de ATENÇÃO a " + rpm + ": o ponto A (acionamento) sobe mais "
                    + "que B (ferramenta) e C (estrutura).";
            case ALARME -> "Gerando janelas simuladas de ALARME a " + rpm + ": A em alarme, B em atenção, C normal.";
        };
    }

    private void exigirHabilitado() {
        if (!propriedades.habilitado()) {
            throw new RecursoNaoEncontradoException("A demonstração está desligada neste ambiente");
        }
    }

    // ------------------------------------------------------------------ o que a geração precisa do banco

    /** Dispositivo, pontos, marcha e referência da demonstração; {@code faltas} vazia = pode gerar. */
    private record Contexto(DispositivoAutenticado dispositivo, Map<String, Long> pontos, int marcha,
                            ReferenciaAtiva referencia, List<String> faltas) {
    }

    private Contexto contexto() {
        Dispositivo d = dispositivos.buscarPorIdentificador(propriedades.dispositivo()).orElse(null);
        if (d == null || !d.isSimulado()) {
            return new Contexto(null, Map.of(), 0, null, List.of("dispositivo simulado"));
        }
        long maquinaId = d.getMaquina().getId();
        DispositivoAutenticado dispositivo = new DispositivoAutenticado(d.getId(), d.getIdentificador(), maquinaId,
                true);
        Map<String, Long> porCodigo = pontos.codigosAtivos(maquinaId).stream()
                .collect(Collectors.toMap(CodigoId::getCodigo, CodigoId::getId));
        int marcha = FiltroQualidade.marcha(propriedades.rotacaoRpm(), avaliacoes.marchas(maquinaId));
        ReferenciaAtiva referencia = referencias.ativa(maquinaId, true).orElse(null);
        if (referencia == null) {
            return new Contexto(dispositivo, porCodigo, marcha, null,
                    List.of("nenhuma versão de referência simulada calculada"));
        }
        return new Contexto(dispositivo, porCodigo, marcha, referencia,
                GeradorDeJanela.faltas(referencia, porCodigo, marcha));
    }
}
