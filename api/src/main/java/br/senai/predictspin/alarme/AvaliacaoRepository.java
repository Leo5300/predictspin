package br.senai.predictspin.alarme;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import br.senai.predictspin.referencia.Medida;

/** SQL da avaliação: estado de cada ponto (travado na transação), avaliações e severidade por dia. */
@Repository
public class AvaliacaoRepository {

    /** Ordem das colunas z_* em AVALIACAO, igual à de {@link Medida}. */
    private static final String[] COLUNAS_Z = {"z_rms", "z_pico", "z_curtose", "z_o1x", "z_o2x", "z_o3x", "z_vel"};

    private final JdbcTemplate jdbc;

    public AvaliacaoRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record EnsaioDaJanela(String etapa, String condicao, Long materialId, Long ferramentaId) {
    }

    public Optional<EnsaioDaJanela> ensaio(long ensaioId) {
        return jdbc.query("SELECT etapa, condicao, material_id, ferramenta_id FROM ensaio WHERE id = ?",
                (rs, i) -> new EnsaioDaJanela(rs.getString("etapa"), rs.getString("condicao"),
                        (Long) rs.getObject("material_id"), (Long) rs.getObject("ferramenta_id")), ensaioId)
                .stream().findFirst();
    }

    public List<Integer> marchas(long maquinaId) {
        return jdbc.query("SELECT rotacoes_nominais_rpm FROM maquina WHERE id = ?", (rs, i) -> {
            Array array = rs.getArray(1);
            List<Integer> lista = new ArrayList<>();
            for (Object o : (Object[]) array.getArray()) {
                lista.add(((Number) o).intValue());
            }
            return lista;
        }, maquinaId).stream().findFirst().orElse(List.of());
    }

    /**
     * Estado dos pontos, criando os que faltam, travados até o fim da transação (FOR UPDATE, em ordem de
     * id para duas janelas simultâneas não se travarem em ordens opostas).
     */
    public Map<Long, EstadoPonto> travarEstados(Collection<Long> pontoIds, boolean simulado) {
        List<Long> ids = pontoIds.stream().sorted().toList();
        Map<Long, EstadoPonto> estados = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return estados;
        }
        String marcas = String.join(",", ids.stream().map(id -> "?").toList());
        List<Object> parametros = new ArrayList<>();
        for (Long id : ids) {
            parametros.add(id);
            parametros.add(simulado);
        }
        jdbc.update("INSERT INTO estado_ponto (ponto_medicao_id, simulado) VALUES "
                + String.join(",", ids.stream().map(id -> "(?, ?)").toList())
                + " ON CONFLICT DO NOTHING", parametros.toArray());
        List<Object> consulta = new ArrayList<>(ids);
        consulta.add(simulado);
        jdbc.query("SELECT * FROM estado_ponto WHERE ponto_medicao_id IN (" + marcas + ") AND simulado = ?"
                + " ORDER BY ponto_medicao_id FOR UPDATE", rs -> {
                    EstadoPonto e = new EstadoPonto(rs.getLong("ponto_medicao_id"), simulado);
                    e.estado = Nivel.doCodigo(rs.getShort("estado"));
                    e.ultimoMedidoEm = instante(rs, "ultimo_medido_em");
                    e.atencaoDesde = instante(rs, "atencao_desde");
                    e.alarmeDesde = instante(rs, "alarme_desde");
                    e.abaixoDesde = instante(rs, "abaixo_desde");
                    e.emAlarmeDesde = instante(rs, "em_alarme_desde");
                    e.ausenteDesde = instante(rs, "ausente_desde");
                    e.sinalBaixoDesde = instante(rs, "sinal_baixo_desde");
                    e.falhaAmostragemEm = instante(rs, "falha_amostragem_em");
                    e.instrumentoOkDesde = instante(rs, "instrumento_ok_desde");
                    e.instrumentoAtivo = rs.getBoolean("instrumento_ativo");
                    e.severidadeDesdeOs = rs.getDouble("severidade_desde_os");
                    estados.put(e.pontoId, e);
                }, consulta.toArray());
        return estados;
    }

    public void gravarEstados(Collection<EstadoPonto> estados) {
        List<EstadoPonto> lista = List.copyOf(estados);
        jdbc.batchUpdate("""
                UPDATE estado_ponto SET estado = ?, ultimo_medido_em = ?, atencao_desde = ?, alarme_desde = ?,
                    abaixo_desde = ?, em_alarme_desde = ?, ausente_desde = ?, sinal_baixo_desde = ?,
                    falha_amostragem_em = ?, instrumento_ok_desde = ?, instrumento_ativo = ?, severidade_desde_os = ?
                WHERE ponto_medicao_id = ? AND simulado = ?
                """, lista, lista.size(), (ps, e) -> {
            ps.setShort(1, e.estado.codigo());
            ps.setObject(2, utc(e.ultimoMedidoEm));
            ps.setObject(3, utc(e.atencaoDesde));
            ps.setObject(4, utc(e.alarmeDesde));
            ps.setObject(5, utc(e.abaixoDesde));
            ps.setObject(6, utc(e.emAlarmeDesde));
            ps.setObject(7, utc(e.ausenteDesde));
            ps.setObject(8, utc(e.sinalBaixoDesde));
            ps.setObject(9, utc(e.falhaAmostragemEm));
            ps.setObject(10, utc(e.instrumentoOkDesde));
            ps.setBoolean(11, e.instrumentoAtivo);
            ps.setDouble(12, e.severidadeDesdeOs);
            ps.setLong(13, e.pontoId);
            ps.setBoolean(14, e.simulado);
        });
    }

    /** Uma linha de AVALIACAO (z em real: 4 bytes cada). */
    public record LinhaAvaliacao(long pontoId, Long versaoId, Situacao situacao, Nivel estado, String etapaRef,
                                 boolean generica, Map<Medida, Double> z) {
    }

    public void inserirAvaliacoes(long janelaId, List<LinhaAvaliacao> linhas) {
        jdbc.batchUpdate("""
                INSERT INTO avaliacao (janela_id, ponto_medicao_id, referencia_versao_id, situacao, estado, etapa_ref,
                                       generica, z_rms, z_pico, z_curtose, z_o1x, z_o2x, z_o3x, z_vel)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, linhas, linhas.size(), (ps, l) -> {
            ps.setLong(1, janelaId);
            ps.setLong(2, l.pontoId());
            ps.setObject(3, l.versaoId(), Types.BIGINT);
            ps.setShort(4, l.situacao().codigo());
            ps.setObject(5, l.estado() == null ? null : l.estado().codigo(), Types.SMALLINT);
            ps.setString(6, l.etapaRef());
            ps.setBoolean(7, l.generica());
            for (Medida m : Medida.values()) {
                Double z = l.z().get(m);
                ps.setObject(8 + m.ordinal(), z == null ? null : (float) z.doubleValue(), Types.REAL);
            }
        });
    }

    /** Soma de severidade de um ponto num dia (unidade z·s) e o tempo acima do limite de ATENÇÃO. */
    public record Severidade(long pontoId, Instant diaInicio, double valor, double horasForaFaixa) {
    }

    public void somarSeveridade(long maquinaId, boolean simulado, List<Severidade> somas) {
        jdbc.batchUpdate("""
                INSERT INTO severidade_acumulada (maquina_id, ponto_medicao_id, simulado, janela_inicio, janela_fim,
                                                  valor, horas_fora_faixa)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (ponto_medicao_id, simulado, janela_inicio) WHERE ponto_medicao_id IS NOT NULL
                DO UPDATE SET valor = severidade_acumulada.valor + EXCLUDED.valor,
                              horas_fora_faixa = severidade_acumulada.horas_fora_faixa + EXCLUDED.horas_fora_faixa
                """, somas, somas.size(), (ps, s) -> {
            ps.setLong(1, maquinaId);
            ps.setLong(2, s.pontoId());
            ps.setBoolean(3, simulado);
            ps.setObject(4, utc(s.diaInicio()));
            ps.setObject(5, utc(s.diaInicio().plusSeconds(86_400)));
            ps.setDouble(6, s.valor());
            ps.setDouble(7, s.horasForaFaixa());
        });
    }

    // ------------------------------------------------------------------ consulta

    public record UltimaJanela(long janelaId, Instant medidoEm, double rotacaoRpm, String etapa, String condicao,
                               Long materialId, Long ferramentaId) {
    }

    public Optional<UltimaJanela> ultimaJanela(long maquinaId, boolean simulado) {
        return jdbc.query("""
                SELECT j.id, j.medido_em, j.rotacao_rpm, e.etapa, e.condicao, e.material_id, e.ferramenta_id
                FROM janela j
                JOIN dispositivo d ON d.id = j.dispositivo_id
                LEFT JOIN ensaio e ON e.id = j.ensaio_id
                WHERE d.maquina_id = ? AND d.simulado = ?
                ORDER BY j.medido_em DESC
                LIMIT 1
                """, (rs, i) -> new UltimaJanela(rs.getLong("id"), instante(rs, "medido_em"),
                rs.getDouble("rotacao_rpm"), rs.getString("etapa"), rs.getString("condicao"),
                (Long) rs.getObject("material_id"), (Long) rs.getObject("ferramenta_id")), maquinaId, simulado)
                .stream().findFirst();
    }

    /** Valores e avaliação (se houver) de cada ponto de uma janela. */
    public record PontoDaJanela(long pontoId, String ponto, double[] valores, Double velRmsMmS, Long versaoId,
                                Situacao situacao, Nivel estado, String etapaRef, boolean generica,
                                Map<Medida, Double> z) {

        public Double valor(Medida medida) {
            // Double.valueOf: com "? velRmsMmS : valores[i]" o Java desembrulharia o nulo (NPE)
            return medida == Medida.VEL_RMS_MM_S ? velRmsMmS : Double.valueOf(valores[medida.ordinal()]);
        }
    }

    public List<PontoDaJanela> pontosDaJanela(long janelaId) {
        return jdbc.query("""
                SELECT t.ponto_medicao_id, pm.codigo, t.rms_g, t.pico_g, t.curtose, t.ordem_1x, t.ordem_2x, t.ordem_3x,
                       t.vel_rms_mm_s, a.referencia_versao_id, a.situacao, a.estado, a.etapa_ref, a.generica,
                       a.z_rms, a.z_pico, a.z_curtose, a.z_o1x, a.z_o2x, a.z_o3x, a.z_vel
                FROM telemetria t
                JOIN ponto_medicao pm ON pm.id = t.ponto_medicao_id
                LEFT JOIN avaliacao a ON a.janela_id = t.janela_id AND a.ponto_medicao_id = t.ponto_medicao_id
                WHERE t.janela_id = ?
                ORDER BY pm.codigo
                """, (rs, i) -> {
            Object situacao = rs.getObject("situacao");
            Object estado = rs.getObject("estado");
            Map<Medida, Double> z = new java.util.EnumMap<>(Medida.class);
            for (Medida m : Medida.values()) {
                Object valor = rs.getObject(COLUNAS_Z[m.ordinal()]);
                if (valor != null) {
                    z.put(m, ((Number) valor).doubleValue());
                }
            }
            return new PontoDaJanela(rs.getLong("ponto_medicao_id"), rs.getString("codigo"),
                    new double[] {rs.getDouble("rms_g"), rs.getDouble("pico_g"), rs.getDouble("curtose"),
                            rs.getDouble("ordem_1x"), rs.getDouble("ordem_2x"), rs.getDouble("ordem_3x")},
                    (Double) rs.getObject("vel_rms_mm_s"), (Long) rs.getObject("referencia_versao_id"),
                    situacao == null ? null : Situacao.doCodigo(((Number) situacao).intValue()),
                    estado == null ? null : Nivel.doCodigo(((Number) estado).intValue()), rs.getString("etapa_ref"),
                    rs.getBoolean("generica"), z);
        }, janelaId);
    }

    private static Instant instante(ResultSet rs, String coluna) throws SQLException {
        OffsetDateTime valor = rs.getObject(coluna, OffsetDateTime.class);
        return valor == null ? null : valor.toInstant();
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante == null ? null : instante.atOffset(ZoneOffset.UTC);
    }
}
