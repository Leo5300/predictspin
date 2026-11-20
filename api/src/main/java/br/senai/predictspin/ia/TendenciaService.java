package br.senai.predictspin.ia;

import java.sql.ResultSet;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.ia.dto.TendenciaResposta;
import br.senai.predictspin.maquina.MaquinaRepository;

/**
 * Tendência por ponto (prognóstico), pronta e DESABILITADA por padrão ({@code ps.tendencia.habilitada}). Séries
 * diárias dos últimos {@code janela-dias}: severidade acumulada (z·s por dia, da tabela diária), deriva (mediana do z
 * do RMS nas janelas avaliadas do dia) e, só com o canal habilitado na fusão, a temperatura média do cabeçote
 * (ponto A). Estimativa só com pelo menos {@code min-dias} dias (ver {@link Tendencia}).
 */
@Service
public class TendenciaService {

    static final String DESABILITADA = "Tendência desabilitada por configuração (ps.tendencia.habilitada).";

    private final JdbcTemplate jdbc;
    private final MaquinaRepository maquinas;
    private final PropriedadesTendencia prop;
    private final PropriedadesFusao fusao;
    private final PropriedadesTreino treino;
    private final Clock relogio;

    public TendenciaService(JdbcTemplate jdbc, MaquinaRepository maquinas, PropriedadesTendencia prop,
                            PropriedadesFusao fusao, PropriedadesTreino treino, Clock relogio) {
        this.jdbc = jdbc;
        this.maquinas = maquinas;
        this.prop = prop;
        this.fusao = fusao;
        this.treino = treino;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public TendenciaResposta tendencia(long maquinaId, boolean simulado) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
        if (!prop.habilitada()) {
            return new TendenciaResposta(false, DESABILITADA, simulado, prop.minDias(), List.of());
        }
        ZoneId fuso = ZoneId.of(treino.fuso());
        Instant desde = relogio.instant().minus(prop.janelaDias(), ChronoUnit.DAYS);
        Map<String, Map<String, TreeMap<LocalDate, Double>>> porPonto = new TreeMap<>();
        jdbc.query("""
                SELECT pm.codigo, s.janela_inicio, sum(s.valor) AS valor
                FROM severidade_acumulada s JOIN ponto_medicao pm ON pm.id = s.ponto_medicao_id
                WHERE pm.maquina_id = ? AND s.simulado = ? AND s.janela_inicio >= ?
                GROUP BY pm.codigo, s.janela_inicio
                """, (ResultSet rs) -> {
            serie(porPonto, rs.getString(1), "severidade").merge(
                    rs.getObject(2, java.time.OffsetDateTime.class).toInstant().atZone(ZoneOffset.UTC).toLocalDate(),
                    rs.getDouble(3), Double::sum);
        }, maquinaId, simulado, desde.atOffset(ZoneOffset.UTC));
        jdbc.query("""
                SELECT pm.codigo, (j.medido_em AT TIME ZONE ?)::date AS dia,
                       percentile_cont(0.5) WITHIN GROUP (ORDER BY a.z_rms) AS valor
                FROM avaliacao a
                JOIN janela j ON j.id = a.janela_id
                JOIN ponto_medicao pm ON pm.id = a.ponto_medicao_id
                JOIN dispositivo d ON d.id = j.dispositivo_id
                WHERE d.maquina_id = ? AND d.simulado = ? AND j.medido_em >= ? AND a.situacao = 0
                  AND a.z_rms IS NOT NULL
                GROUP BY pm.codigo, dia
                """, (ResultSet rs) -> {
            serie(porPonto, rs.getString(1), "deriva").put(rs.getObject(2, LocalDate.class), rs.getDouble(3));
        }, treino.fuso(), maquinaId, simulado, desde.atOffset(ZoneOffset.UTC));
        if (fusao.habilitados().contains("temp_cabecote_c")) {
            jdbc.query("""
                    SELECT (j.medido_em AT TIME ZONE ?)::date AS dia, avg(l.valor) AS valor
                    FROM leitura l
                    JOIN canal c ON c.id = l.canal_id
                    JOIN janela j ON j.id = l.janela_id
                    JOIN dispositivo d ON d.id = j.dispositivo_id
                    WHERE d.maquina_id = ? AND d.simulado = ? AND j.medido_em >= ? AND c.codigo = 'temp_cabecote_c'
                    GROUP BY dia
                    """, (ResultSet rs) -> {
                serie(porPonto, "A", "temp_cabecote_c").put(rs.getObject(1, LocalDate.class), rs.getDouble(2));
            }, treino.fuso(), maquinaId, simulado, desde.atOffset(ZoneOffset.UTC));
        }
        List<TendenciaResposta.PontoTendencia> pontos = new ArrayList<>();
        porPonto.forEach((ponto, series) -> {
            List<TendenciaResposta.Serie> lista = new ArrayList<>();
            series.forEach((nome, dias) -> lista.add(serie(nome, dias)));
            pontos.add(new TendenciaResposta.PontoTendencia(ponto, lista));
        });
        return new TendenciaResposta(true, null, simulado, prop.minDias(), pontos);
    }

    private static TreeMap<LocalDate, Double> serie(Map<String, Map<String, TreeMap<LocalDate, Double>>> porPonto,
                                                    String ponto, String nome) {
        return porPonto.computeIfAbsent(ponto, p -> new LinkedHashMap<>()).computeIfAbsent(nome, n -> new TreeMap<>());
    }

    private TendenciaResposta.Serie serie(String nome, TreeMap<LocalDate, Double> dias) {
        double limite = switch (nome) {
            case "severidade" -> prop.limiteSeveridade();
            case "deriva" -> prop.limiteDerivaZ();
            default -> prop.limiteTempCabecoteC();
        };
        String unidade = switch (nome) {
            case "severidade" -> "z·s/dia";
            case "deriva" -> "σ";
            default -> "°C";
        };
        LocalDate primeiro = dias.isEmpty() ? null : dias.firstKey();
        List<Tendencia.Ponto> pontos = new ArrayList<>();
        List<TendenciaResposta.Dia> lista = new ArrayList<>();
        dias.forEach((dia, valor) -> {
            pontos.add(new Tendencia.Ponto(ChronoUnit.DAYS.between(primeiro, dia), valor));
            lista.add(new TendenciaResposta.Dia(dia, valor));
        });
        Tendencia.Resultado r = Tendencia.calcular(pontos, prop.minDias(), limite);
        if (r == null) {
            return new TendenciaResposta.Serie(nome, unidade, limite, lista, null, null, null, null, null,
                    "menos de " + prop.minDias() + " dias com dado: sem estimativa");
        }
        return new TendenciaResposta.Serie(nome, unidade, limite, lista, r.inclinacao(), r.minima(), r.maxima(),
                r.diasMin(), r.diasMax(), r.texto());
    }
}
