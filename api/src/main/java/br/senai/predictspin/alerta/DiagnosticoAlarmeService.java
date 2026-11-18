package br.senai.predictspin.alerta;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.alarme.AvaliacaoService;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.alerta.dto.DiagnosticoAlarmeResposta;
import br.senai.predictspin.alerta.dto.LimitesResposta;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.ordemservico.PropriedadesOs;
import br.senai.predictspin.referencia.Estatistica;
import br.senai.predictspin.referencia.FiltroQualidade;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaService;

/**
 * Diagnóstico da regra de alarme: limites em uso, indicadores de desempenho e, por ponto, severidade
 * acumulada, deriva, piso de ruído e janelas com calibração diferente da referência.
 * <p>
 * Deriva: para cada janela de USO (sem ensaio) avaliada NORMAL nas últimas 24 h, a razão entre o RMS e o
 * típico da célula com que foi comparada (a marcha muda o nível, por isso a razão e não o valor); a
 * deriva é a mediana das razões menos 1, em %.
 */
@Service
public class DiagnosticoAlarmeService {

    /** Mais que isto de janelas por ponto não muda a mediana e pesaria no banco gratuito. */
    static final int MAX_JANELAS_DERIVA = 2000;

    private final JdbcTemplate jdbc;
    private final AlertaService alertas;
    private final ReferenciaService referencias;
    private final AvaliacaoService avaliacoes;
    private final MaquinaRepository maquinas;
    private final LimitesResposta limites;
    private final Clock relogio;

    public DiagnosticoAlarmeService(JdbcTemplate jdbc, AlertaService alertas, ReferenciaService referencias,
                                    MaquinaRepository maquinas, PropriedadesReferencia ref, PropriedadesAlarme alarme,
                                    PropriedadesOs os, Clock relogio, AvaliacaoService avaliacoes) {
        this.avaliacoes = avaliacoes;
        this.jdbc = jdbc;
        this.alertas = alertas;
        this.referencias = referencias;
        this.maquinas = maquinas;
        this.limites = new LimitesResposta(ref, alarme, os);
        this.relogio = relogio;
    }

    public LimitesResposta limites() {
        return limites;
    }

    @Transactional(readOnly = true)
    public DiagnosticoAlarmeResposta diagnostico(Long maquinaId, boolean simulado) {
        Maquina maquina = maquinas.findById(maquinaId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada"));
        Instant agora = relogio.instant();
        Instant desde = agora.minus(Duration.ofHours(24));
        AlertaService.Indicadores ind = alertas.indicadores(maquinaId, simulado);
        Optional<ReferenciaAtiva> ref = referencias.ativa(maquinaId, simulado);

        Map<Long, double[]> severidade = new HashMap<>();
        jdbc.query("""
                SELECT ponto_medicao_id,
                       coalesce(sum(valor) FILTER (WHERE janela_inicio >= ?), 0) AS hoje,
                       coalesce(sum(valor), 0) AS semana
                FROM severidade_acumulada
                WHERE maquina_id = ? AND simulado = ? AND ponto_medicao_id IS NOT NULL AND janela_inicio >= ?
                GROUP BY ponto_medicao_id
                """, rs -> {
            severidade.put(rs.getLong(1), new double[] {rs.getDouble("hoje"), rs.getDouble("semana")});
        }, utc(agora.truncatedTo(ChronoUnit.DAYS)), maquinaId, simulado,
                utc(agora.truncatedTo(ChronoUnit.DAYS).minus(Duration.ofDays(6))));

        Map<Long, Long> calibracao = new HashMap<>();
        jdbc.query("""
                SELECT a.ponto_medicao_id, count(*) FROM avaliacao a
                JOIN janela j ON j.id = a.janela_id
                JOIN dispositivo d ON d.id = j.dispositivo_id
                WHERE d.maquina_id = ? AND d.simulado = ? AND a.situacao = 3 AND j.medido_em >= ?
                GROUP BY a.ponto_medicao_id
                """, rs -> {
            calibracao.put(rs.getLong(1), rs.getLong(2));
        }, maquinaId, simulado, utc(desde));

        Map<Long, List<Double>> razoes = new HashMap<>();
        ref.ifPresent(r -> jdbc.query("""
                SELECT a.ponto_medicao_id, a.etapa_ref, j.rotacao_rpm, t.rms_g FROM avaliacao a
                JOIN janela j ON j.id = a.janela_id
                JOIN dispositivo d ON d.id = j.dispositivo_id
                JOIN telemetria t ON t.janela_id = a.janela_id AND t.ponto_medicao_id = a.ponto_medicao_id
                WHERE d.maquina_id = ? AND d.simulado = ? AND j.ensaio_id IS NULL AND j.medido_em >= ?
                  AND a.situacao = 0 AND a.estado = 0 AND a.etapa_ref IS NOT NULL
                  AND greatest(abs(coalesce(a.z_rms, 0)), abs(coalesce(a.z_pico, 0)), abs(coalesce(a.z_o1x, 0)),
                               abs(coalesce(a.z_o2x, 0)), abs(coalesce(a.z_o3x, 0)), abs(coalesce(a.z_vel, 0))) < ?
                ORDER BY j.medido_em DESC
                LIMIT ?
                """, rs -> {
            long ponto = rs.getLong(1);
            int marcha = FiltroQualidade.marcha(rs.getDouble(3), maquina.getRotacoesNominaisRpm());
            double rms = rs.getDouble(4);
            r.celula(ponto, Medida.RMS_G, marcha, rs.getString(2))
                    .filter(c -> c.mediana() > 0)
                    .ifPresent(c -> razoes.computeIfAbsent(ponto, k -> new ArrayList<>()).add(rms / c.mediana()));
        }, maquinaId, simulado, utc(desde), limites.alarme().zAtencao(), MAX_JANELAS_DERIVA * 3));

        Map<Long, Double> pisos = new HashMap<>();
        Map<Long, Double> desdeOs = new HashMap<>();
        jdbc.query("SELECT ponto_medicao_id, severidade_desde_os FROM estado_ponto WHERE simulado = ?",
                rs -> {
                    desdeOs.put(rs.getLong(1), rs.getDouble(2));
                }, simulado);
        ref.ifPresent(r -> jdbc.query("""
                SELECT ponto_medicao_id, max(piso_ruido) FROM referencia_celula
                WHERE versao_id = ? AND medida = 'rms_g' AND piso_ruido IS NOT NULL
                GROUP BY ponto_medicao_id
                """, rs -> {
            pisos.put(rs.getLong(1), rs.getDouble(2));
        }, r.versaoId()));

        List<DiagnosticoAlarmeResposta.Ponto> pontos = new ArrayList<>();
        List<String> avisos = new ArrayList<>();
        jdbc.query("SELECT id, codigo FROM ponto_medicao WHERE maquina_id = ? AND ativo ORDER BY codigo", rs -> {
            long id = rs.getLong(1);
            String codigo = rs.getString(2);
            double[] s = severidade.getOrDefault(id, new double[] {0, 0});
            List<Double> lista = razoes.getOrDefault(id, List.of());
            Double deriva = null;
            if (!lista.isEmpty()) {
                double[] ordenadas = lista.stream().mapToDouble(Double::doubleValue).sorted().toArray();
                deriva = (Estatistica.percentil(ordenadas, 0.5) - 1) * 100;
            }
            long cal = calibracao.getOrDefault(id, 0L);
            if (cal > 0) {
                avisos.add("Sensor " + codigo + " com calibração diferente da referência em " + cal
                        + " janela(s) nas últimas 24 h: recalcule a referência.");
            }
            pontos.add(new DiagnosticoAlarmeResposta.Ponto(codigo, s[0], s[1], desdeOs.getOrDefault(id, 0.0), deriva,
                    lista.size(), pisos.get(id), cal));
        }, maquinaId);

        if (ref.isEmpty()) {
            avisos.add(0, "Sem referência calculada: nenhum ponto é chamado de atenção ou alarme.");
        } else if (pisos.isEmpty()) {
            avisos.add(0, "Sem piso de ruído medido: grave um ensaio T0 (torno desligado) e recalcule a referência.");
        }
        return new DiagnosticoAlarmeResposta(simulado, limites,
                new DiagnosticoAlarmeResposta.Indicadores(ind.alertasPorHora(), ind.piorDezMinutos(),
                        ind.pontosRepetitivos(), ind.parados(), ind.suprimidos()),
                !pisos.isEmpty(), ref.map(ReferenciaAtiva::numero).orElse(null), pontos, avisos,
                avaliacoes.falhasDeAvaliacao());
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante.atOffset(ZoneOffset.UTC);
    }
}
