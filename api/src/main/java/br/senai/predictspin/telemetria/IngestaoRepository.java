package br.senai.predictspin.telemetria;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Gravação da ingestão em SQL direto: a idempotência depende de INSERT ... ON CONFLICT DO NOTHING,
 * e os pontos e canais vão em lote. Participa da mesma transação JPA do Service.
 */
@Repository
public class IngestaoRepository {

    private final JdbcTemplate jdbc;

    public IngestaoRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Insere a janela; vazio se (dispositivo, medido_em) já existia. */
    public Optional<Long> inserirJanela(long dispositivoId, Long ensaioId, Instant medidoEm, Instant recebidoEm,
                                        double rotacaoRpm, boolean saturou) {
        List<Long> ids = jdbc.queryForList("""
                INSERT INTO janela (dispositivo_id, ensaio_id, medido_em, recebido_em, rotacao_rpm, saturou)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (dispositivo_id, medido_em) DO NOTHING
                RETURNING id
                """, Long.class, dispositivoId, ensaioId, utc(medidoEm), utc(recebidoEm), rotacaoRpm, saturou);
        return ids.stream().findFirst();
    }

    public Optional<JanelaExistente> buscarJanela(long dispositivoId, Instant medidoEm) {
        return jdbc.query("SELECT id, ensaio_id FROM janela WHERE dispositivo_id = ? AND medido_em = ?",
                (rs, i) -> new JanelaExistente(rs.getLong("id"), (Long) rs.getObject("ensaio_id")),
                dispositivoId, utc(medidoEm)).stream().findFirst();
    }

    public void inserirTelemetrias(long janelaId, List<LinhaTelemetria> linhas) {
        jdbc.batchUpdate("""
                INSERT INTO telemetria (janela_id, ponto_medicao_id, rms_g, pico_g, curtose, ordem_1x, ordem_2x, ordem_3x)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, linhas, linhas.size(), (ps, l) -> {
            ps.setLong(1, janelaId);
            ps.setLong(2, l.pontoId());
            ps.setDouble(3, l.rmsG());
            ps.setDouble(4, l.picoG());
            ps.setDouble(5, l.curtose());
            ps.setDouble(6, l.o1x());
            ps.setDouble(7, l.o2x());
            ps.setDouble(8, l.o3x());
        });
    }

    public void inserirLeituras(long janelaId, Map<Long, Double> valoresPorCanal) {
        List<Map.Entry<Long, Double>> linhas = List.copyOf(valoresPorCanal.entrySet());
        jdbc.batchUpdate("INSERT INTO leitura (janela_id, canal_id, valor) VALUES (?, ?, ?)",
                linhas, linhas.size(), (ps, l) -> {
                    ps.setLong(1, janelaId);
                    ps.setLong(2, l.getKey());
                    ps.setDouble(3, l.getValue());
                });
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante.atOffset(ZoneOffset.UTC);
    }

    public record JanelaExistente(long id, Long ensaioId) {
    }

    public record LinhaTelemetria(long pontoId, double rmsG, double picoG, double curtose,
                                  double o1x, double o2x, double o3x) {
    }
}
