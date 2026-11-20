package br.senai.predictspin.ia;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import br.senai.predictspin.telemetria.IngestaoRepository.LinhaTelemetria;
import br.senai.predictspin.telemetria.ModoJanela;

/**
 * Janelas ROTULADAS para o treino. Nunca devolve janela sem rótulo.
 * <ul>
 *   <li><b>ensaio</b>: janelas de ensaios encerrados e não descartados, com condição entre as 5 classes, das
 *       etapas T1 e T3; rótulo = condição do ensaio. A janela que contém um evento marcado e a seguinte ficam
 *       com {@code evento_marcado} (como na exportação CSV) e não entram;</li>
 *   <li><b>os_confirmada</b>: OS concluída como confirmada, com condição encontrada entre as 5: as janelas de uso
 *       (sem ensaio) da máquina no período do alerta de origem, com a condição encontrada;</li>
 *   <li><b>os_rejeitada</b>: OS concluída como rejeitada (falso positivo): as janelas do período, como normal.</li>
 * </ul>
 * Período do alerta = da janela de origem até a primeira janela em que o ponto do alerta voltou a NORMAL (é quando o
 * alerta normaliza), pelo medido_em das janelas; se o ponto não voltou, até a conclusão da OS.
 */
@Repository
public class ConjuntoTreinoRepository {

    public static final List<String> CLASSES = List.of("normal", "avanco_excessivo", "rotacao_inadequada",
            "ferramenta_desgastada", "desbalanceamento");

    private final JdbcTemplate jdbc;

    public ConjuntoTreinoRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Uma janela candidata, com o rótulo e de onde ele veio. */
    public record Candidata(long janelaId, Instant medidoEm, String rotulo, String origem, Long ensaioId, Long osId,
                            String etapa, boolean eventoMarcado) {
    }

    private static final String CLASSES_SQL = "('normal', 'avanco_excessivo', 'rotacao_inadequada', "
            + "'ferramenta_desgastada', 'desbalanceamento')";

    private String candidatas(boolean usarOs) {
        String ensaio = """
                SELECT j.id AS janela_id, j.medido_em, e.condicao AS rotulo, 'ensaio' AS origem, e.id AS ensaio_id,
                       NULL::bigint AS os_id, e.etapa,
                       EXISTS (SELECT 1 FROM ensaio_evento ev
                               WHERE ev.ensaio_id = e.id
                                 AND ev.ocorrido_em >= coalesce(
                                     (SELECT max(ja.medido_em) FROM janela ja
                                      WHERE ja.ensaio_id = e.id AND ja.medido_em < j.medido_em), j.medido_em)
                                 AND ev.ocorrido_em < j.medido_em + CASE WHEN j.modo = 'rapido'
                                     THEN interval '1 second' ELSE interval '5 seconds' END) AS evento_marcado
                FROM janela j
                JOIN dispositivo d ON d.id = j.dispositivo_id
                JOIN ensaio e ON e.id = j.ensaio_id
                WHERE d.maquina_id = ? AND d.simulado = ? AND e.simulado = ?
                  AND e.encerrado_em IS NOT NULL AND NOT e.descartado
                  AND e.etapa IN ('T1', 'T3') AND e.condicao IN """ + CLASSES_SQL;
        if (!usarOs) {
            return ensaio;
        }
        return ensaio + """

                UNION ALL
                SELECT j.id, j.medido_em,
                       CASE WHEN os.retorno_tecnico = 'confirmada' THEN os.condicao_encontrada ELSE 'normal' END,
                       'os_' || os.retorno_tecnico, NULL::bigint, os.id, NULL, false
                FROM ordem_servico os
                JOIN alerta al ON al.id = os.alerta_id
                JOIN janela jo ON jo.id = al.janela_id
                -- fim do período: a primeira janela depois da origem em que o ponto do alerta voltou a NORMAL
                -- (é quando o alerta normaliza); sem ela, a duração do alerta até a conclusão da OS
                CROSS JOIN LATERAL (
                    SELECT coalesce(
                        (SELECT min(jn.medido_em) FROM janela jn
                         JOIN avaliacao an ON an.janela_id = jn.id AND an.ponto_medicao_id = al.ponto_medicao_id
                         WHERE jn.dispositivo_id = jo.dispositivo_id AND jn.medido_em > jo.medido_em
                           AND an.estado = 0),
                        jo.medido_em + (os.concluida_em - al.criado_em)) AS fim) periodo
                JOIN dispositivo d ON d.maquina_id = os.maquina_id AND d.simulado = os.simulado
                JOIN janela j ON j.dispositivo_id = d.id AND j.ensaio_id IS NULL
                             AND j.medido_em >= jo.medido_em AND j.medido_em < periodo.fim
                WHERE os.maquina_id = ? AND os.simulado = ? AND os.status = 'concluida'
                  AND ((os.retorno_tecnico = 'confirmada' AND os.condicao_encontrada IN """ + CLASSES_SQL + """
                       ) OR os.retorno_tecnico = 'rejeitada')""";
    }

    private static Object[] parametros(long maquinaId, boolean simulado, boolean usarOs) {
        return usarOs ? new Object[] {maquinaId, simulado, simulado, maquinaId, simulado}
                : new Object[] {maquinaId, simulado, simulado};
    }

    public long contar(long maquinaId, boolean simulado, boolean usarOs) {
        // uma janela pode estar no período de duas OS: conta (e devolve) cada janela uma vez só
        Long n = jdbc.queryForObject("SELECT count(DISTINCT janela_id) FROM (" + candidatas(usarOs) + ") c",
                Long.class, parametros(maquinaId, simulado, usarOs));
        return n == null ? 0 : n;
    }

    /**
     * Uma página, em ordem de janela. Janela no período de mais de uma OS (alertas de A, B e C no mesmo episódio):
     * vale a confirmada (o problema confirmado vale para o período inteiro da máquina), depois a de menor id.
     */
    public List<Candidata> pagina(long maquinaId, boolean simulado, boolean usarOs, int pagina, int tamanho) {
        List<Object> p = new ArrayList<>(List.of(parametros(maquinaId, simulado, usarOs)));
        p.add(tamanho);
        p.add((long) pagina * tamanho);
        return jdbc.query("SELECT DISTINCT ON (janela_id) * FROM (" + candidatas(usarOs) + ") c "
                + "ORDER BY janela_id, (os_id IS NULL) DESC, (origem = 'os_confirmada') DESC, os_id LIMIT ? OFFSET ?",
                (rs, i) -> new Candidata(
                rs.getLong("janela_id"), rs.getObject("medido_em", OffsetDateTime.class).toInstant(),
                rs.getString("rotulo"), rs.getString("origem"), (Long) rs.getObject("ensaio_id"),
                (Long) rs.getObject("os_id"), rs.getString("etapa"), rs.getBoolean("evento_marcado")), p.toArray());
    }

    /** O que o vetor precisa de cada janela: envio, pontos e canais. */
    public record DadosJanela(long janelaId, double rotacaoRpm, boolean saturou, ModoJanela modo, Integer amostras,
                              Integer amostrasEsperadas, String calibracaoJson, Map<String, LinhaTelemetria> linhas,
                              Map<String, Double> canais) {
    }

    public Map<Long, DadosJanela> dados(Collection<Long> janelaIds) {
        Map<Long, DadosJanela> porId = new LinkedHashMap<>();
        if (janelaIds.isEmpty()) {
            return porId;
        }
        Long[] ids = janelaIds.toArray(Long[]::new);
        jdbc.query("""
                SELECT j.id, j.rotacao_rpm, j.saturou, j.modo, j.amostras, j.amostras_esperadas, j.calibracao
                FROM janela j WHERE j.id = ANY (?)
                """, (ResultSet rs) -> {
            porId.put(rs.getLong("id"), new DadosJanela(rs.getLong("id"), rs.getDouble("rotacao_rpm"),
                    rs.getBoolean("saturou"), ModoJanela.de(rs.getString("modo")), (Integer) rs.getObject("amostras"),
                    (Integer) rs.getObject("amostras_esperadas"), rs.getString("calibracao"), new HashMap<>(),
                    new HashMap<>()));
        }, (Object) ids);
        jdbc.query("""
                SELECT t.janela_id, t.ponto_medicao_id, pm.codigo, t.rms_g, t.pico_g, t.curtose, t.ordem_1x,
                       t.ordem_2x, t.ordem_3x, t.vel_rms_mm_s
                FROM telemetria t JOIN ponto_medicao pm ON pm.id = t.ponto_medicao_id
                WHERE t.janela_id = ANY (?)
                """, (ResultSet rs) -> {
            DadosJanela d = porId.get(rs.getLong("janela_id"));
            d.linhas().put(rs.getString("codigo"), linha(rs));
        }, (Object) ids);
        jdbc.query("""
                SELECT l.janela_id, c.codigo, l.valor
                FROM leitura l JOIN canal c ON c.id = l.canal_id
                WHERE l.janela_id = ANY (?)
                """, (ResultSet rs) -> {
            porId.get(rs.getLong("janela_id")).canais().put(rs.getString("codigo"), rs.getDouble("valor"));
        }, (Object) ids);
        return porId;
    }

    private static LinhaTelemetria linha(ResultSet rs) throws SQLException {
        return new LinhaTelemetria(rs.getLong("ponto_medicao_id"), rs.getDouble("rms_g"), rs.getDouble("pico_g"),
                rs.getDouble("curtose"), rs.getDouble("ordem_1x"), rs.getDouble("ordem_2x"), rs.getDouble("ordem_3x"),
                (Double) rs.getObject("vel_rms_mm_s"));
    }

    /** Códigos → ids dos pontos ativos da máquina. */
    public Map<String, Long> pontos(long maquinaId) {
        Map<String, Long> pontos = new LinkedHashMap<>();
        jdbc.query("SELECT codigo, id FROM ponto_medicao WHERE maquina_id = ? AND ativo ORDER BY codigo",
                (ResultSet rs) -> {
                    pontos.put(rs.getString("codigo"), rs.getLong("id"));
                }, maquinaId);
        return pontos;
    }
}
