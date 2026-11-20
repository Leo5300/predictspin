package br.senai.predictspin.ia;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Versões de modelo, trabalhos de treino e inferências (V9). */
@Repository
public class ModeloRepository {

    private final JdbcTemplate jdbc;

    public ModeloRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ modelo

    /** Uma versão, sem os arquivos. {@code metadados} é o JSON devolvido pelo treino. */
    public record Linha(long id, long maquinaId, boolean simulado, int versao, String estado, Instant criadoEm,
                        String criadoPor, Instant ativadoEm, String ativadoPor, Long trabalhoId, String versaoVetor,
                        Long referenciaVersaoId, Integer referenciaNumero, double limiar, String metadados,
                        String conjunto, int tamanhoBytes, boolean temClassificador) {
    }

    public record Arquivos(byte[] anomalia, byte[] classe, byte[] arvores) {
    }

    public record Novo(long maquinaId, boolean simulado, Long criadoPorId, Long trabalhoId, String versaoVetor,
                       Long referenciaVersaoId, Integer referenciaNumero, double limiar, String caracteristicas,
                       String canais, String classes, String metadados, String conjunto, byte[] anomalia, byte[] classe,
                       byte[] arvores, int tamanhoBytes) {
    }

    private static final String SELECT = """
            SELECT m.id, m.maquina_id, m.simulado, m.versao, m.estado, m.criado_em, uc.nome AS criado_por, m.ativado_em,
                   ua.nome AS ativado_por, m.trabalho_id, m.versao_vetor, m.referencia_versao_id, m.referencia_numero,
                   m.limiar_anomalia, m.metricas::text AS metadados, m.conjunto::text AS conjunto, m.tamanho_bytes,
                   (m.onnx_classe IS NOT NULL) AS tem_classificador
            FROM modelo m
            LEFT JOIN usuario uc ON uc.id = m.criado_por_id
            LEFT JOIN usuario ua ON ua.id = m.ativado_por_id
            """;

    /** Grava a versão nova (próximo número da máquina e tipo de dado) como CANDIDATO; devolve o id. */
    public long inserir(Novo n) {
        return jdbc.queryForObject("""
                INSERT INTO modelo (maquina_id, simulado, versao, estado, criado_por_id, trabalho_id, versao_vetor,
                                    referencia_versao_id, referencia_numero, limiar_anomalia, caracteristicas, canais,
                                    classes, metricas, conjunto, onnx_anomalia, onnx_classe, arvores, tamanho_bytes)
                VALUES (?, ?, (SELECT coalesce(max(versao), 0) + 1 FROM modelo WHERE maquina_id = ? AND simulado = ?),
                        'candidato', ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, n.maquinaId(), n.simulado(), n.maquinaId(), n.simulado(), n.criadoPorId(),
                n.trabalhoId(), n.versaoVetor(), n.referenciaVersaoId(), n.referenciaNumero(), n.limiar(),
                n.caracteristicas(), n.canais(), n.classes(), n.metadados(), n.conjunto(), n.anomalia(), n.classe(),
                n.arvores(), n.tamanhoBytes());
    }

    public Optional<Linha> buscar(long id) {
        return jdbc.query(SELECT + " WHERE m.id = ?", (rs, i) -> linha(rs), id).stream().findFirst();
    }

    public List<Linha> listar(long maquinaId, boolean simulado, int limite, long deslocamento) {
        return jdbc.query(SELECT + " WHERE m.maquina_id = ? AND m.simulado = ? ORDER BY m.versao DESC LIMIT ? OFFSET ?",
                (rs, i) -> linha(rs), maquinaId, simulado, limite, deslocamento);
    }

    public long contar(long maquinaId, boolean simulado) {
        return jdbc.queryForObject("SELECT count(*) FROM modelo WHERE maquina_id = ? AND simulado = ?", Long.class,
                maquinaId, simulado);
    }

    public Optional<Linha> ativo(long maquinaId, boolean simulado) {
        return jdbc.query(SELECT + " WHERE m.maquina_id = ? AND m.simulado = ? AND m.estado = 'ativo'",
                (rs, i) -> linha(rs), maquinaId, simulado).stream().findFirst();
    }

    public boolean referenciaExiste(long versaoId, long maquinaId, boolean simulado) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM referencia_versao "
                + "WHERE id = ? AND maquina_id = ? AND simulado = ?)", Boolean.class, versaoId, maquinaId, simulado));
    }

    public Arquivos arquivos(long id) {
        return jdbc.queryForObject("SELECT onnx_anomalia, onnx_classe, arvores FROM modelo WHERE id = ?",
                (rs, i) -> new Arquivos(rs.getBytes(1), rs.getBytes(2), rs.getBytes(3)), id);
    }

    /** A versão dada vira ATIVA; a ativa anterior da máquina e tipo de dado vira ARQUIVADA. */
    public void ativar(Linha m, Long usuarioId, Instant agora) {
        jdbc.update("UPDATE modelo SET estado = 'arquivado' WHERE maquina_id = ? AND simulado = ? AND estado = 'ativo'",
                m.maquinaId(), m.simulado());
        jdbc.update("UPDATE modelo SET estado = 'ativo', ativado_em = ?, ativado_por_id = ? WHERE id = ?", utc(agora),
                usuarioId, m.id());
    }

    private static Linha linha(ResultSet rs) throws SQLException {
        return new Linha(rs.getLong("id"), rs.getLong("maquina_id"), rs.getBoolean("simulado"), rs.getInt("versao"),
                rs.getString("estado"), instante(rs, "criado_em"), rs.getString("criado_por"),
                instante(rs, "ativado_em"), rs.getString("ativado_por"), (Long) rs.getObject("trabalho_id"),
                rs.getString("versao_vetor"), (Long) rs.getObject("referencia_versao_id"),
                (Integer) rs.getObject("referencia_numero"), rs.getDouble("limiar_anomalia"),
                rs.getString("metadados"), rs.getString("conjunto"), rs.getInt("tamanho_bytes"),
                rs.getBoolean("tem_classificador"));
    }

    // ------------------------------------------------------------------ trabalho de treino

    public record Trabalho(long id, long maquinaId, boolean simulado, String estado, String mensagem, Instant criadoEm,
                           String criadoPor, Instant iniciadoEm, Instant concluidoEm, Long modeloId,
                           Integer modeloVersao) {
    }

    private static final String SELECT_TRABALHO = """
            SELECT t.*, u.nome AS criado_por, m.versao AS modelo_versao
            FROM trabalho_treino t
            LEFT JOIN usuario u ON u.id = t.criado_por_id
            LEFT JOIN modelo m ON m.id = t.modelo_id
            """;

    /** Cria o trabalho; o índice único recusa um segundo em andamento na mesma máquina e tipo de dado. */
    public long criarTrabalho(long maquinaId, boolean simulado, Long usuarioId, String estado, String mensagem,
                              Instant agora) {
        return jdbc.queryForObject("""
                INSERT INTO trabalho_treino (maquina_id, simulado, estado, mensagem, criado_por_id, criado_em)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, Long.class, maquinaId, simulado, estado, mensagem, usuarioId, utc(agora));
    }

    public void mudarTrabalho(long id, String estado, String mensagem, Instant iniciadoEm, Instant concluidoEm,
                              Long modeloId) {
        jdbc.update("""
                UPDATE trabalho_treino SET estado = ?, mensagem = ?, iniciado_em = coalesce(iniciado_em, ?),
                       concluido_em = coalesce(?, concluido_em), modelo_id = coalesce(?, modelo_id)
                WHERE id = ?
                """, estado, mensagem, utc(iniciadoEm), utc(concluidoEm), modeloId, id);
    }

    public Optional<Trabalho> trabalho(long id) {
        return jdbc.query(SELECT_TRABALHO + " WHERE t.id = ?", (rs, i) -> trabalho(rs), id).stream().findFirst();
    }

    /** Trava a linha do trabalho (mudanças de estado de quem chama ao mesmo tempo: API e serviço de treino). */
    public Optional<String> travarTrabalho(long id) {
        return jdbc.query("SELECT estado FROM trabalho_treino WHERE id = ? FOR UPDATE", (rs, i) -> rs.getString(1), id)
                .stream().findFirst();
    }

    public List<Trabalho> trabalhos(long maquinaId, boolean simulado, int limite, long deslocamento) {
        return jdbc.query(SELECT_TRABALHO + " WHERE t.maquina_id = ? AND t.simulado = ? ORDER BY t.id DESC LIMIT ? OFFSET ?",
                (rs, i) -> trabalho(rs), maquinaId, simulado, limite, deslocamento);
    }

    public long contarTrabalhos(long maquinaId, boolean simulado) {
        return jdbc.queryForObject("SELECT count(*) FROM trabalho_treino WHERE maquina_id = ? AND simulado = ?",
                Long.class, maquinaId, simulado);
    }

    /** Trabalhos em andamento criados antes de {@code limite} (passaram do prazo). */
    public List<Trabalho> vencidos(Instant limite) {
        return jdbc.query(SELECT_TRABALHO + " WHERE t.estado IN ('pendente', 'acordando', 'executando') "
                + "AND t.criado_em < ?", (rs, i) -> trabalho(rs), utc(limite));
    }

    private static Trabalho trabalho(ResultSet rs) throws SQLException {
        return new Trabalho(rs.getLong("id"), rs.getLong("maquina_id"), rs.getBoolean("simulado"), rs.getString("estado"),
                rs.getString("mensagem"), instante(rs, "criado_em"), rs.getString("criado_por"),
                instante(rs, "iniciado_em"), instante(rs, "concluido_em"), (Long) rs.getObject("modelo_id"),
                (Integer) rs.getObject("modelo_versao"));
    }

    // ------------------------------------------------------------------ inferência

    public void inserirInferencia(long janelaId, long modeloId, double escore, boolean anomalia, Integer classe,
                                  Double confianca) {
        jdbc.update("""
                INSERT INTO inferencia (janela_id, modelo_id, escore, anomalia, classe, confianca)
                VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (janela_id) DO NOTHING
                """, janelaId, modeloId, (float) escore, anomalia, classe, confianca == null ? null
                : (float) confianca.doubleValue());
    }

    /** Segunda opinião mais recente nos alertas de máquina ativos e nas OS abertas; a da abertura, se ainda vazia. */
    public void atualizarOpinioes(long maquinaId, boolean simulado, String json) {
        jdbc.update("""
                UPDATE alerta SET opiniao_recente = ?::jsonb, opiniao_abertura = coalesce(opiniao_abertura, ?::jsonb)
                WHERE maquina_id = ? AND simulado = ? AND tipo = 'maquina'
                  AND estado IN ('ativo_nao_reconhecido', 'ativo_reconhecido', 'suprimido')
                """, json, json, maquinaId, simulado);
        jdbc.update("""
                UPDATE ordem_servico SET opiniao_recente = ?::jsonb, opiniao_abertura = coalesce(opiniao_abertura, ?::jsonb)
                WHERE maquina_id = ? AND simulado = ? AND status IN ('aberta', 'em_andamento')
                """, json, json, maquinaId, simulado);
    }

    /** Inferências das janelas da máquina desde {@code desde}: total, anomalias e contagem por classe. */
    public record Resumo(long total, long anomalias, java.util.Map<Integer, Long> porClasse) {
    }

    public Resumo resumoDesde(long modeloId, long maquinaId, boolean simulado, Instant desde) {
        java.util.Map<Integer, Long> porClasse = new java.util.TreeMap<>();
        long[] totais = {0, 0};
        jdbc.query("""
                SELECT i.classe, count(*) AS n, count(*) FILTER (WHERE i.anomalia) AS anomalias
                FROM inferencia i JOIN janela j ON j.id = i.janela_id JOIN dispositivo d ON d.id = j.dispositivo_id
                WHERE i.modelo_id = ? AND d.maquina_id = ? AND d.simulado = ? AND j.medido_em >= ?
                GROUP BY i.classe
                """, (ResultSet rs) -> {
            long n = rs.getLong("n");
            totais[0] += n;
            totais[1] += rs.getLong("anomalias");
            Integer classe = (Integer) rs.getObject("classe");
            if (classe != null) {
                porClasse.put(classe, n);
            }
        }, modeloId, maquinaId, simulado, utc(desde));
        return new Resumo(totais[0], totais[1], porClasse);
    }

    private static Instant instante(ResultSet rs, String coluna) throws SQLException {
        OffsetDateTime v = rs.getObject(coluna, OffsetDateTime.class);
        return v == null ? null : v.toInstant();
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante == null ? null : instante.atOffset(ZoneOffset.UTC);
    }
}
