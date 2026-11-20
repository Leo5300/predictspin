package br.senai.predictspin.ordemservico;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import br.senai.predictspin.alerta.RetornoTecnico;
import br.senai.predictspin.ordemservico.dto.OrdemServicoResposta;

/** SQL da ordem de serviço aberta pela regra. */
@Repository
public class OrdemServicoSql {

    private static final String SELECT = """
            SELECT os.*, m.codigo AS maquina_codigo, pm.codigo AS ponto_codigo, c.tipo AS componente_tipo,
                   v.numero AS versao_numero, u.nome AS responsavel_nome
            FROM ordem_servico os
            JOIN maquina m ON m.id = os.maquina_id
            JOIN ponto_medicao pm ON pm.id = os.ponto_medicao_id
            LEFT JOIN componente c ON c.id = os.componente_id
            LEFT JOIN referencia_versao v ON v.id = os.referencia_versao_id
            LEFT JOIN usuario u ON u.id = os.responsavel_id
            """;

    private final JdbcTemplate jdbc;

    public OrdemServicoSql(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Já existe OS aberta (ou em andamento) para o ponto e o tipo de dado? */
    public boolean temAberta(long pontoId, boolean simulado) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM ordem_servico WHERE ponto_medicao_id = ? AND simulado = ?
                               AND status IN ('aberta', 'em_andamento'))
                """, Boolean.class, pontoId, simulado));
    }

    /**
     * Alerta de máquina ativo do ponto e não suprimido, com a explicação, a ação e se já gerou OS (um alerta
     * gera no máximo uma OS: restrição da V1).
     */
    public record AlertaAtivo(long id, String explicacao, String acao, boolean temOs) {
    }

    public Optional<AlertaAtivo> alertaAtivo(long pontoId, boolean simulado) {
        return jdbc.query("""
                SELECT a.id, a.explicacao, a.acao_recomendada,
                       EXISTS (SELECT 1 FROM ordem_servico os WHERE os.alerta_id = a.id) AS tem_os
                FROM alerta a
                WHERE a.ponto_medicao_id = ? AND a.tipo = 'maquina' AND a.simulado = ?
                  AND a.estado IN ('ativo_nao_reconhecido', 'ativo_reconhecido')
                """, (rs, i) -> new AlertaAtivo(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getBoolean(4)),
                pontoId, simulado).stream().findFirst();
    }

    public record Nova(long maquinaId, long pontoId, Long componenteId, Long alertaId, String motivo,
                       String explicacao, String acao, double severidade, Long versaoId, String firmwareVersao,
                       String calibracao, boolean simulado, Instant abertaEm) {
    }

    /** Insere a OS; o número é OS-ano-sequência. Vazio se outra transação abriu a do ponto antes. */
    public Optional<Long> inserir(Nova n) {
        String numero = "OS-" + n.abertaEm().atOffset(ZoneOffset.UTC).getYear() + "-"
                + String.format("%04d", jdbc.queryForObject("SELECT nextval('ordem_servico_numero_seq')", Long.class));
        return jdbc.queryForList("""
                INSERT INTO ordem_servico (maquina_id, alerta_id, componente_id, numero, status, severidade_acumulada,
                                           ponto_medicao_id, motivo_abertura, explicacao, acao_recomendada,
                                           referencia_versao_id, firmware_versao, calibracao, simulado, aberta_em)
                VALUES (?, ?, ?, ?, 'aberta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                RETURNING id
                """, Long.class, n.maquinaId(), n.alertaId(), n.componenteId(), numero, n.severidade(), n.pontoId(),
                n.motivo(), n.explicacao(), n.acao(), n.versaoId(), n.firmwareVersao(), n.calibracao(), n.simulado(),
                utc(n.abertaEm())).stream().findFirst();
    }

    /** Estado atual da OS, travado até o fim da transação. */
    public Optional<StatusOrdemServico> travar(long id) {
        return jdbc.query("SELECT status FROM ordem_servico WHERE id = ? FOR UPDATE",
                (rs, i) -> StatusOrdemServico.de(rs.getString(1)), id).stream().findFirst();
    }

    public void assumir(long id, long usuarioId, Instant agora) {
        jdbc.update("UPDATE ordem_servico SET status = 'em_andamento', responsavel_id = ?, assumida_em = ? WHERE id = ?",
                usuarioId, utc(agora), id);
    }

    /** Conclui com o retorno; quem conclui sem ter assumido vira o responsável. */
    public void concluir(long id, long usuarioId, RetornoTecnico retorno, String comentario,
                         CondicaoEncontrada condicao, Instant agora) {
        jdbc.update("""
                UPDATE ordem_servico SET status = 'concluida', concluida_em = ?, retorno_tecnico = ?,
                       comentario_tecnico = ?, condicao_encontrada = ?, responsavel_id = coalesce(responsavel_id, ?),
                       assumida_em = coalesce(assumida_em, ?)
                WHERE id = ?
                """, utc(agora), retorno.valor(), comentario, condicao == null ? null : condicao.valor(), usuarioId,
                utc(agora), id);
        // o retorno também fica no alerta de origem: é o rótulo do treino da parte B
        jdbc.update("""
                UPDATE alerta SET retorno_tecnico = ?
                WHERE id = (SELECT alerta_id FROM ordem_servico WHERE id = ?)
                """, retorno.valor(), id);
    }

    public Optional<OrdemServicoResposta> buscar(long id) {
        return jdbc.query(SELECT + " WHERE os.id = ?", (rs, i) -> resposta(rs), id).stream().findFirst();
    }

    public record Filtro(Long maquinaId, StatusOrdemServico status, String ponto, Boolean simulado) {
    }

    public List<OrdemServicoResposta> listar(Filtro f, int limite, long deslocamento) {
        List<Object> p = new ArrayList<>();
        String onde = onde(f, p);
        p.add(limite);
        p.add(deslocamento);
        return jdbc.query(SELECT + onde + """
                 ORDER BY (os.status IN ('aberta', 'em_andamento')) DESC, os.aberta_em DESC, os.id DESC
                 LIMIT ? OFFSET ?
                """, (rs, i) -> resposta(rs), p.toArray());
    }

    public long contar(Filtro f) {
        List<Object> p = new ArrayList<>();
        String onde = onde(f, p);
        return jdbc.queryForObject("SELECT count(*) FROM ordem_servico os JOIN ponto_medicao pm"
                + " ON pm.id = os.ponto_medicao_id" + onde, Long.class, p.toArray());
    }

    private static String onde(Filtro f, List<Object> p) {
        StringBuilder sql = new StringBuilder(" WHERE os.ponto_medicao_id IS NOT NULL");
        if (f.maquinaId() != null) {
            sql.append(" AND os.maquina_id = ?");
            p.add(f.maquinaId());
        }
        if (f.status() != null) {
            sql.append(" AND os.status = ?");
            p.add(f.status().valor());
        }
        if (f.ponto() != null) {
            sql.append(" AND pm.codigo = ?");
            p.add(f.ponto());
        }
        if (f.simulado() != null) {
            sql.append(" AND os.simulado = ?");
            p.add(f.simulado());
        }
        return sql.toString();
    }

    private static OrdemServicoResposta resposta(ResultSet rs) throws SQLException {
        String retorno = rs.getString("retorno_tecnico");
        String condicao = rs.getString("condicao_encontrada");
        return new OrdemServicoResposta(rs.getLong("id"), rs.getString("numero"), rs.getLong("maquina_id"),
                rs.getString("maquina_codigo"), rs.getString("ponto_codigo"), rs.getString("componente_tipo"),
                StatusOrdemServico.de(rs.getString("status")), rs.getString("motivo_abertura"),
                (Long) rs.getObject("alerta_id"), rs.getString("explicacao"), rs.getString("acao_recomendada"),
                rs.getDouble("severidade_acumulada"), (Integer) rs.getObject("versao_numero"),
                rs.getString("firmware_versao"), rs.getString("calibracao"), rs.getBoolean("simulado"),
                rs.getString("responsavel_nome"), instante(rs, "aberta_em"), instante(rs, "assumida_em"),
                instante(rs, "concluida_em"), retorno == null ? null : RetornoTecnico.de(retorno),
                rs.getString("comentario_tecnico"), condicao == null ? null : CondicaoEncontrada.de(condicao));
    }

    private static Instant instante(ResultSet rs, String coluna) throws SQLException {
        OffsetDateTime valor = rs.getObject(coluna, OffsetDateTime.class);
        return valor == null ? null : valor.toInstant();
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante == null ? null : instante.atOffset(ZoneOffset.UTC);
    }
}
