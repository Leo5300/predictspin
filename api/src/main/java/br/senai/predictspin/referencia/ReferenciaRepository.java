package br.senai.predictspin.referencia;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import br.senai.predictspin.telemetria.ModoJanela;

/** SQL da referência: leitura das janelas candidatas e gravação de versões e células (imutáveis). */
@Repository
public class ReferenciaRepository {

    private static final String COLUNAS_JANELA = """
            j.id AS janela_id, j.medido_em, j.rotacao_rpm, j.saturou, j.modo, j.amostras, j.amostras_esperadas,
            j.firmware_versao, j.calibracao, t.ponto_medicao_id, pm.codigo AS ponto, t.rms_g, t.pico_g, t.curtose,
            t.ordem_1x, t.ordem_2x, t.ordem_3x, t.vel_rms_mm_s
            """;

    private final JdbcTemplate jdbc;

    public ReferenciaRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Uma linha por janela e ponto, de todos os ensaios da máquina e do tipo de dado (real ou simulado). */
    public List<LinhaJanela> janelasDeEnsaios(long maquinaId, boolean simulado) {
        return jdbc.query("SELECT " + COLUNAS_JANELA + """
                , e.etapa, e.condicao, e.descartado, e.material_id, e.ferramenta_id
                FROM janela j
                JOIN dispositivo d ON d.id = j.dispositivo_id
                JOIN ensaio e ON e.id = j.ensaio_id
                JOIN telemetria t ON t.janela_id = j.id
                JOIN ponto_medicao pm ON pm.id = t.ponto_medicao_id
                WHERE d.maquina_id = ? AND d.simulado = ? AND e.simulado = ?
                ORDER BY j.medido_em, j.id, pm.codigo
                """, (rs, i) -> linha(rs, rs.getString("etapa"), rs.getString("condicao"),
                rs.getBoolean("descartado"), (Long) rs.getObject("material_id"),
                (Long) rs.getObject("ferramenta_id")), maquinaId, simulado, simulado);
    }

    /**
     * Janelas de uso (sem ensaio) desde {@code desde}, avaliadas NORMAL no ponto, sem alerta aberto na
     * máquina no instante da janela, e com |z| abaixo de {@code zMaximo} em todas as medidas (perto do
     * normal nos dois sentidos: uma janela de giro em vazio comparada com o corte tem z muito negativo e
     * puxaria a referência do corte para baixo). A etapa vem da referência usada na avaliação.
     */
    public List<LinhaJanela> janelasDeDeriva(long maquinaId, boolean simulado, Instant desde, double zMaximo) {
        return jdbc.query("SELECT " + COLUNAS_JANELA + """
                , a.etapa_ref
                FROM janela j
                JOIN dispositivo d ON d.id = j.dispositivo_id
                JOIN telemetria t ON t.janela_id = j.id
                JOIN ponto_medicao pm ON pm.id = t.ponto_medicao_id
                JOIN avaliacao a ON a.janela_id = j.id AND a.ponto_medicao_id = t.ponto_medicao_id
                WHERE d.maquina_id = ? AND d.simulado = ? AND j.ensaio_id IS NULL AND j.medido_em >= ?
                  AND a.situacao = 0 AND a.estado = 0 AND a.etapa_ref IS NOT NULL
                  AND greatest(abs(coalesce(a.z_rms, 0)), abs(coalesce(a.z_pico, 0)), abs(coalesce(a.z_curtose, 0)),
                               abs(coalesce(a.z_o1x, 0)), abs(coalesce(a.z_o2x, 0)), abs(coalesce(a.z_o3x, 0)),
                               abs(coalesce(a.z_vel, 0))) < ?
                  AND NOT EXISTS (SELECT 1 FROM alerta al
                                  WHERE al.maquina_id = d.maquina_id AND al.simulado = d.simulado
                                    AND al.criado_em <= j.medido_em
                                    AND (al.normalizado_em IS NULL OR al.normalizado_em >= j.medido_em))
                ORDER BY j.medido_em DESC, j.id DESC, pm.codigo
                """, (rs, i) -> linha(rs, rs.getString("etapa_ref"), "normal", false, null, null),
                maquinaId, simulado, utc(desde), zMaximo);
    }

    private static LinhaJanela linha(ResultSet rs, String etapa, String condicao, boolean descartado,
                                     Long materialId, Long ferramentaId) throws SQLException {
        return new LinhaJanela(rs.getLong("janela_id"), rs.getObject("medido_em", OffsetDateTime.class).toInstant(),
                rs.getDouble("rotacao_rpm"), rs.getBoolean("saturou"), ModoJanela.de(rs.getString("modo")),
                (Integer) rs.getObject("amostras"), (Integer) rs.getObject("amostras_esperadas"),
                rs.getString("firmware_versao"), rs.getString("calibracao"), rs.getLong("ponto_medicao_id"),
                rs.getString("ponto"), etapa, condicao, descartado, materialId, ferramentaId,
                new double[] {rs.getDouble("rms_g"), rs.getDouble("pico_g"), rs.getDouble("curtose"),
                        rs.getDouble("ordem_1x"), rs.getDouble("ordem_2x"), rs.getDouble("ordem_3x")},
                (Double) rs.getObject("vel_rms_mm_s"));
    }

    public int proximoNumero(long maquinaId, boolean simulado) {
        Integer maior = jdbc.queryForObject(
                "SELECT max(numero) FROM referencia_versao WHERE maquina_id = ? AND simulado = ?",
                Integer.class, maquinaId, simulado);
        return maior == null ? 1 : maior + 1;
    }

    public long inserirVersao(long maquinaId, boolean simulado, int numero, Instant criadaEm, Long autorId,
                              int usadas, int deriva, String excluidasJson, String parametrosJson) {
        return jdbc.queryForObject("""
                INSERT INTO referencia_versao (maquina_id, simulado, numero, criada_em, autor_id, janelas_usadas,
                                               janelas_deriva, excluidas, parametros)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
                RETURNING id
                """, Long.class, maquinaId, simulado, numero, utc(criadaEm), autorId, usadas, deriva,
                excluidasJson, parametrosJson);
    }

    public void inserirCelulas(long versaoId, List<NovaCelula> celulas) {
        jdbc.batchUpdate("""
                INSERT INTO referencia_celula (versao_id, ponto_medicao_id, medida, marcha_rpm, etapa, por_receita,
                    material_id, ferramenta_id, n, n_deriva, mediana, sigma, p95, piso_ruido, sigma_efetivo,
                    suficiente, calibracao, firmware_versoes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, celulas, 500, (ps, c) -> {
            ps.setLong(1, versaoId);
            ps.setLong(2, c.pontoId());
            ps.setString(3, c.medida().valor());
            ps.setInt(4, c.marchaRpm());
            ps.setString(5, c.etapa());
            ps.setBoolean(6, c.porReceita());
            ps.setObject(7, c.materialId(), Types.BIGINT);
            ps.setObject(8, c.ferramentaId(), Types.BIGINT);
            ps.setInt(9, c.n());
            ps.setInt(10, c.nDeriva());
            ps.setDouble(11, c.mediana());
            ps.setDouble(12, c.sigma());
            ps.setDouble(13, c.p95());
            ps.setObject(14, c.pisoRuido(), Types.DOUBLE);
            ps.setDouble(15, c.sigmaEfetivo());
            ps.setBoolean(16, c.suficiente());
            ps.setString(17, c.calibracao());
            ps.setString(18, c.firmwareVersoes());
        });
    }

    /** Versão mais recente da máquina e do tipo de dado. */
    public Optional<VersaoGravada> versaoAtiva(long maquinaId, boolean simulado) {
        return jdbc.query(SELECT_VERSAO + " WHERE v.maquina_id = ? AND v.simulado = ? ORDER BY v.numero DESC LIMIT 1",
                (rs, i) -> versao(rs), maquinaId, simulado).stream().findFirst();
    }

    public List<VersaoGravada> versoes(long maquinaId, boolean simulado, int limite, long deslocamento) {
        return jdbc.query(SELECT_VERSAO + " WHERE v.maquina_id = ? AND v.simulado = ? ORDER BY v.numero DESC"
                + " LIMIT ? OFFSET ?", (rs, i) -> versao(rs), maquinaId, simulado, limite, deslocamento);
    }

    public long contarVersoes(long maquinaId, boolean simulado) {
        return jdbc.queryForObject("SELECT count(*) FROM referencia_versao WHERE maquina_id = ? AND simulado = ?",
                Long.class, maquinaId, simulado);
    }

    private static final String SELECT_VERSAO = """
            SELECT v.id, v.numero, v.simulado, v.criada_em, u.nome AS autor, v.janelas_usadas, v.janelas_deriva,
                   v.excluidas::text AS excluidas, v.parametros::text AS parametros,
                   (SELECT count(*) FROM referencia_celula c WHERE c.versao_id = v.id) AS celulas,
                   (SELECT count(*) FROM referencia_celula c WHERE c.versao_id = v.id AND c.suficiente) AS suficientes
            FROM referencia_versao v
            LEFT JOIN usuario u ON u.id = v.autor_id
            """;

    private static VersaoGravada versao(ResultSet rs) throws SQLException {
        return new VersaoGravada(rs.getLong("id"), rs.getInt("numero"), rs.getBoolean("simulado"),
                rs.getObject("criada_em", OffsetDateTime.class).toInstant(), rs.getString("autor"),
                rs.getInt("janelas_usadas"), rs.getInt("janelas_deriva"), rs.getString("excluidas"),
                rs.getString("parametros"), rs.getInt("celulas"), rs.getInt("suficientes"));
    }

    public List<CelulaGravada> celulas(long versaoId) {
        return jdbc.query("""
                SELECT c.id, c.ponto_medicao_id, pm.codigo AS ponto, c.medida, c.marcha_rpm, c.etapa, c.por_receita,
                       c.material_id, c.ferramenta_id, c.n, c.n_deriva, c.mediana, c.sigma, c.p95, c.piso_ruido,
                       c.sigma_efetivo, c.suficiente, c.calibracao, c.firmware_versoes
                FROM referencia_celula c
                JOIN ponto_medicao pm ON pm.id = c.ponto_medicao_id
                WHERE c.versao_id = ?
                ORDER BY pm.codigo, c.etapa, c.marcha_rpm, c.por_receita, c.material_id, c.ferramenta_id, c.medida
                """, (rs, i) -> new CelulaGravada(rs.getLong("id"), rs.getLong("ponto_medicao_id"),
                rs.getString("ponto"), Medida.de(rs.getString("medida")), rs.getInt("marcha_rpm"),
                rs.getString("etapa"), rs.getBoolean("por_receita"), (Long) rs.getObject("material_id"),
                (Long) rs.getObject("ferramenta_id"), rs.getInt("n"), rs.getInt("n_deriva"),
                rs.getDouble("mediana"), rs.getDouble("sigma"), rs.getDouble("p95"),
                (Double) rs.getObject("piso_ruido"), rs.getDouble("sigma_efetivo"), rs.getBoolean("suficiente"),
                rs.getString("calibracao"), rs.getString("firmware_versoes")), versaoId);
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante.atOffset(ZoneOffset.UTC);
    }

    /**
     * Uma janela num ponto. {@code valores} segue a ordem rms_g, pico_g, curtose, o1x, o2x, o3x; a
     * velocidade é opcional. {@code etapa} é a do ensaio ou, na deriva, a da referência usada.
     */
    public record LinhaJanela(long janelaId, Instant medidoEm, double rotacaoRpm, boolean saturou, ModoJanela modo,
                              Integer amostras, Integer amostrasEsperadas, String firmwareVersao,
                              String calibracaoJson, long pontoId, String ponto, String etapa, String condicao,
                              boolean descartado, Long materialId, Long ferramentaId, double[] valores,
                              Double velRmsMmS) {

        /** Valor da medida, ou nulo (velocidade ausente). */
        public Double valor(Medida medida) {
            // Double.valueOf: com "? velRmsMmS : valores[i]" o Java desembrulharia o nulo (NPE)
            return medida == Medida.VEL_RMS_MM_S ? velRmsMmS : Double.valueOf(valores[medida.ordinal()]);
        }

        public boolean ordensZeradas() {
            return valores[3] == 0 && valores[4] == 0 && valores[5] == 0;
        }
    }

    public record NovaCelula(long pontoId, Medida medida, int marchaRpm, String etapa, boolean porReceita,
                             Long materialId, Long ferramentaId, int n, int nDeriva, double mediana, double sigma,
                             double p95, Double pisoRuido, double sigmaEfetivo, boolean suficiente,
                             String calibracao, String firmwareVersoes) {
    }

    public record VersaoGravada(long id, int numero, boolean simulado, Instant criadaEm, String autor,
                                int janelasUsadas, int janelasDeriva, String excluidasJson, String parametrosJson,
                                int celulas, int suficientes) {
    }

    public record CelulaGravada(long id, long pontoId, String ponto, Medida medida, int marchaRpm, String etapa,
                                boolean porReceita, Long materialId, Long ferramentaId, int n, int nDeriva,
                                double mediana, double sigma, double p95, Double pisoRuido, double sigmaEfetivo,
                                boolean suficiente, String calibracao, String firmwareVersoes) {
    }
}
