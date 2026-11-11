package br.senai.predictspin.telemetria;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.CodigoId;
import br.senai.predictspin.comum.OperacaoProibidaException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.CanalRepository;
import br.senai.predictspin.maquina.DispositivoRepository;
import br.senai.predictspin.maquina.ModoRapidoService;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.dto.IngestaoResposta;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;

/**
 * Recebe uma janela de telemetria de um dispositivo autenticado.
 * <ul>
 *   <li>o campo "dispositivo" tem de ser o mesmo do cabeçalho;</li>
 *   <li>pontos e canais têm de existir (e estar ativos) na máquina do dispositivo;</li>
 *   <li>reenvio do mesmo (dispositivo, medido_em) não grava nada e devolve a janela existente;</li>
 *   <li>se houver ensaio aberto na máquina, do mesmo tipo (real ou simulado) do dispositivo,
 *       a janela é gravada com ele.</li>
 * </ul>
 */
@Service
public class IngestaoService {

    /** Tolerância para relógio do dispositivo adiantado em relação ao servidor. */
    static final Duration TOLERANCIA_FUTURO = Duration.ofMinutes(5);

    /**
     * Resolução de DISPOSITIVO.ultimo_contato. Atualizar a mesma linha em toda janela fazia as
     * ingestões concorrentes do mesmo dispositivo esperarem umas pelas outras até o COMMIT
     * (medição em docs/teste-de-carga.md); com o intervalo, só uma janela a cada 10 s trava a linha.
     */
    static final Duration INTERVALO_CONTATO = Duration.ofSeconds(10);

    private final IngestaoRepository ingestao;
    private final PontoMedicaoRepository pontos;
    private final CanalRepository canais;
    private final DispositivoRepository dispositivos;
    private final EnsaioRepository ensaios;
    private final ModoRapidoService modoRapido;
    private final Clock relogio;

    public IngestaoService(IngestaoRepository ingestao, PontoMedicaoRepository pontos, CanalRepository canais,
                           DispositivoRepository dispositivos, EnsaioRepository ensaios, ModoRapidoService modoRapido,
                           Clock relogio) {
        this.ingestao = ingestao;
        this.pontos = pontos;
        this.canais = canais;
        this.dispositivos = dispositivos;
        this.ensaios = ensaios;
        this.modoRapido = modoRapido;
        this.relogio = relogio;
    }

    @Transactional
    public Resultado receber(DispositivoAutenticado dispositivo, TelemetriaRequisicao req) {
        if (!dispositivo.identificador().equals(req.dispositivo().trim())) {
            throw new OperacaoProibidaException("O campo 'dispositivo' (" + req.dispositivo()
                    + ") não corresponde ao dispositivo autenticado pelo cabeçalho");
        }
        Instant agora = relogio.instant();
        // O banco guarda microssegundos: truncar antes evita que o reenvio pareça outra janela
        Instant medidoEm = req.medidoEm().truncatedTo(ChronoUnit.MICROS);
        if (medidoEm.isAfter(agora.plus(TOLERANCIA_FUTURO))) {
            throw new RequisicaoInvalidaException("medido_em está no futuro (" + medidoEm
                    + "); confira o relógio do dispositivo");
        }

        List<IngestaoRepository.LinhaTelemetria> linhas = resolverPontos(dispositivo.maquinaId(), req.pontos());
        Map<Long, Double> leituras = resolverCanais(dispositivo.maquinaId(), req.canais());

        dispositivos.registrarContato(dispositivo.id(), agora, agora.minus(INTERVALO_CONTATO));

        Long ensaioId = ensaios.idAberto(dispositivo.maquinaId(), dispositivo.simulado()).orElse(null);
        var amostragem = new IngestaoRepository.Amostragem(req.modoOuNormal(), req.amostras(), req.amostrasEsperadas());
        Optional<Long> novaJanela = ingestao.inserirJanela(dispositivo.id(), ensaioId, medidoEm, agora,
                req.rotacaoRpm(), req.saturou(), amostragem);
        // Vale para envio novo e para reenvio: é assim que o dispositivo fica sabendo do modo rápido
        Instant modoRapidoAte = modoRapido.vigente(dispositivo.maquinaId());

        if (novaJanela.isEmpty()) {
            IngestaoRepository.JanelaExistente existente = ingestao.buscarJanela(dispositivo.id(), medidoEm)
                    .orElseThrow(() -> new IllegalStateException("Janela em conflito não encontrada"));
            return new Resultado(new IngestaoResposta(existente.id(), true, existente.ensaioId(), medidoEm,
                    modoRapidoAte));
        }

        long janelaId = novaJanela.get();
        ingestao.inserirTelemetrias(janelaId, linhas);
        if (!leituras.isEmpty()) {
            ingestao.inserirLeituras(janelaId, leituras);
        }
        return new Resultado(new IngestaoResposta(janelaId, false, ensaioId, medidoEm, modoRapidoAte));
    }

    private List<IngestaoRepository.LinhaTelemetria> resolverPontos(Long maquinaId,
                                                                    Map<String, TelemetriaRequisicao.MedidaPonto> medidas) {
        Map<String, Long> idPorCodigo = mapa(pontos.codigosAtivos(maquinaId));
        exigirConhecidos("pontos", medidas.keySet(), idPorCodigo);
        List<IngestaoRepository.LinhaTelemetria> linhas = new ArrayList<>(medidas.size());
        medidas.forEach((codigo, m) -> linhas.add(new IngestaoRepository.LinhaTelemetria(
                idPorCodigo.get(codigo.trim()), m.rmsG(), m.picoG(), m.curtose(), m.o1x(), m.o2x(), m.o3x())));
        return linhas;
    }

    private Map<Long, Double> resolverCanais(Long maquinaId, Map<String, Double> valores) {
        if (valores == null || valores.isEmpty()) {
            return Map.of();
        }
        Map<String, Long> idPorCodigo = mapa(canais.codigosAtivos(maquinaId));
        exigirConhecidos("canais", valores.keySet(), idPorCodigo);
        Map<Long, Double> leituras = new LinkedHashMap<>();
        valores.forEach((codigo, valor) -> leituras.put(idPorCodigo.get(codigo.trim()), valor));
        return leituras;
    }

    private static Map<String, Long> mapa(List<CodigoId> codigos) {
        return codigos.stream().collect(Collectors.toMap(CodigoId::getCodigo, CodigoId::getId));
    }

    private static void exigirConhecidos(String campo, Set<String> recebidos, Map<String, Long> conhecidos) {
        Set<String> desconhecidos = new TreeSet<>();
        for (String codigo : recebidos) {
            if (!conhecidos.containsKey(codigo.trim())) {
                desconhecidos.add(codigo);
            }
        }
        if (!desconhecidos.isEmpty()) {
            throw new RequisicaoInvalidaException("Código(s) desconhecido(s) em '" + campo + "': " + desconhecidos
                    + ". Aceitos nesta máquina: " + new TreeSet<>(conhecidos.keySet()));
        }
    }

    /** Resposta e se a janela foi criada agora (201) ou já existia (200). */
    public record Resultado(IngestaoResposta resposta) {
        public boolean criada() {
            return !resposta.duplicada();
        }
    }
}
