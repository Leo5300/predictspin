package br.senai.predictspin.telemetria;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.maquina.PontoMedicaoRepository;
import br.senai.predictspin.telemetria.dto.TelemetriaPontoResposta;
import br.senai.predictspin.telemetria.dto.UltimaJanelaResposta;

@Service
@Transactional(readOnly = true)
public class ConsultaTelemetriaService {

    /** Período padrão da série quando "de" não é informado. */
    static final Duration PERIODO_PADRAO = Duration.ofHours(24);

    private final TelemetriaRepository telemetrias;
    private final JanelaRepository janelas;
    private final LeituraRepository leituras;
    private final PontoMedicaoRepository pontos;
    private final MaquinaRepository maquinas;
    private final Clock relogio;

    public ConsultaTelemetriaService(TelemetriaRepository telemetrias, JanelaRepository janelas,
                                     LeituraRepository leituras, PontoMedicaoRepository pontos,
                                     MaquinaRepository maquinas, Clock relogio) {
        this.telemetrias = telemetrias;
        this.janelas = janelas;
        this.leituras = leituras;
        this.pontos = pontos;
        this.maquinas = maquinas;
        this.relogio = relogio;
    }

    /** Série de um ponto entre "de" (inclusivo) e "ate" (exclusivo), mais recente primeiro. */
    public Pagina<TelemetriaPontoResposta> seriePorPonto(Long pontoId, Instant de, Instant ate, Boolean simulado,
                                                         Pageable pageable) {
        if (!pontos.existsById(pontoId)) {
            throw new RecursoNaoEncontradoException("Ponto de medição " + pontoId + " não encontrado");
        }
        Instant fim = ate != null ? ate : relogio.instant().plusSeconds(1);
        Instant inicio = de != null ? de : fim.minus(PERIODO_PADRAO);
        if (!inicio.isBefore(fim)) {
            throw new RequisicaoInvalidaException("'de' precisa ser anterior a 'ate'");
        }
        return Pagina.de(telemetrias.seriePorPonto(pontoId, inicio, fim, simulado, pageable));
    }

    /** Última janela da máquina, com os pontos e os canais: três consultas fixas. */
    public UltimaJanelaResposta ultimaJanela(Long maquinaId, Boolean simulado) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        Janela janela = janelas.maisRecentes(maquinaId, simulado, PageRequest.of(0, 1)).stream().findFirst()
                .orElseThrow(() -> new RecursoNaoEncontradoException(
                        "Nenhuma janela recebida para a máquina " + maquinaId));

        Map<String, UltimaJanelaResposta.Ponto> porPonto = new LinkedHashMap<>();
        for (Telemetria t : telemetrias.daJanela(janela.getId())) {
            var p = t.getPonto();
            porPonto.put(p.getCodigo(), new UltimaJanelaResposta.Ponto(p.getId(), p.getPapel().valor(),
                    p.getDescricao(), t.getRmsG(), t.getPicoG(), t.getCurtose(), t.getOrdem1x(), t.getOrdem2x(),
                    t.getOrdem3x()));
        }
        Map<String, UltimaJanelaResposta.Canal> porCanal = new LinkedHashMap<>();
        for (Leitura l : leituras.daJanela(janela.getId())) {
            var c = l.getCanal();
            porCanal.put(c.getCodigo(), new UltimaJanelaResposta.Canal(l.getValor(), c.getUnidade(),
                    c.getGrandeza().valor()));
        }

        Ensaio ensaio = janela.getEnsaio();
        long segundos = Math.max(0, Duration.between(janela.getRecebidoEm(), relogio.instant()).toSeconds());
        return new UltimaJanelaResposta(janela.getId(), janela.getDispositivo().getIdentificador(),
                janela.getDispositivo().isSimulado(), janela.getMedidoEm(), janela.getRecebidoEm(), segundos,
                janela.getRotacaoRpm(), janela.isSaturou(), ensaio == null ? null : ensaio.getId(),
                ensaio == null ? null : ensaio.getCodigo(), porPonto, porCanal);
    }
}
