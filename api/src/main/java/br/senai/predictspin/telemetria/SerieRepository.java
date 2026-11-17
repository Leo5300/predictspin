package br.senai.predictspin.telemetria;

import java.sql.Types;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Série agregada em SQL direto: o banco divide o período em intervalos iguais e devolve, em uma
 * única consulta, os agregados por intervalo e por ponto. Intervalo sem janela não gera linha.
 */
@Repository
public class SerieRepository {

    private static final String SQL = """
            WITH jb AS (
                SELECT j.id, j.rotacao_rpm, j.saturou,
                       LEAST(FLOOR(EXTRACT(EPOCH FROM (j.medido_em - :de)) / :largura)::int, :baldes - 1) AS balde
                FROM janela j
                JOIN dispositivo d ON d.id = j.dispositivo_id
                WHERE d.maquina_id = :maquinaId
                  AND j.medido_em >= :de AND j.medido_em < :ate
                  AND j.modo = 'normal'
                  AND (CAST(:simulado AS boolean) IS NULL OR d.simulado = CAST(:simulado AS boolean))
            ),
            b AS (
                SELECT balde, count(*) AS janelas, avg(rotacao_rpm) AS rotacao_media, bool_or(saturou) AS saturou
                FROM jb
                GROUP BY balde
            ),
            p AS (
                SELECT jb.balde, pm.codigo,
                       avg(t.rms_g) AS rms_media, max(t.rms_g) AS rms_max, max(t.pico_g) AS pico_max,
                       avg(t.curtose) AS curtose_media,
                       avg(t.ordem_1x) AS o1x_media, avg(t.ordem_2x) AS o2x_media, avg(t.ordem_3x) AS o3x_media,
                       avg(t.vel_rms_mm_s) AS vel_media, max(t.vel_rms_mm_s) AS vel_max
                FROM jb
                JOIN telemetria t ON t.janela_id = jb.id
                JOIN ponto_medicao pm ON pm.id = t.ponto_medicao_id
                GROUP BY jb.balde, pm.codigo
            )
            SELECT b.balde, b.janelas, b.rotacao_media, b.saturou, p.codigo,
                   p.rms_media, p.rms_max, p.pico_max, p.curtose_media, p.o1x_media, p.o2x_media, p.o3x_media,
                   p.vel_media, p.vel_max
            FROM b
            LEFT JOIN p ON p.balde = b.balde
            ORDER BY b.balde, p.codigo
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public SerieRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Uma linha por (intervalo, ponto); o ponto vem nulo se as janelas do intervalo não trouxeram pontos. */
    public List<Linha> agregar(long maquinaId, Instant de, Instant ate, Boolean simulado, int baldes,
                               double larguraSegundos) {
        MapSqlParameterSource parametros = new MapSqlParameterSource()
                .addValue("maquinaId", maquinaId)
                .addValue("de", de.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("ate", ate.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("simulado", simulado, Types.BOOLEAN)
                .addValue("baldes", baldes)
                .addValue("largura", larguraSegundos);
        return jdbc.query(SQL, parametros, (rs, i) -> new Linha(
                rs.getInt("balde"), rs.getLong("janelas"), rs.getDouble("rotacao_media"), rs.getBoolean("saturou"),
                rs.getString("codigo"), rs.getDouble("rms_media"), rs.getDouble("rms_max"), rs.getDouble("pico_max"),
                rs.getDouble("curtose_media"), rs.getDouble("o1x_media"), rs.getDouble("o2x_media"),
                rs.getDouble("o3x_media"), rs.getObject("vel_media", Double.class),
                rs.getObject("vel_max", Double.class)));
    }

    /** Uma linha agregada; a velocidade é nula quando nenhuma janela do intervalo a trouxe. */
    public record Linha(int balde, long janelas, double rotacaoMedia, boolean saturou, String ponto,
                        double rmsMedia, double rmsMax, double picoMax, double curtoseMedia,
                        double o1xMedia, double o2xMedia, double o3xMedia, Double velMedia, Double velMax) {

        public Linha(int balde, long janelas, double rotacaoMedia, boolean saturou, String ponto, double rmsMedia,
                     double rmsMax, double picoMax, double curtoseMedia, double o1xMedia, double o2xMedia,
                     double o3xMedia) {
            this(balde, janelas, rotacaoMedia, saturou, ponto, rmsMedia, rmsMax, picoMax, curtoseMedia, o1xMedia,
                    o2xMedia, o3xMedia, null, null);
        }
    }
}
