package br.senai.predictspin.push;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import br.senai.predictspin.push.dto.AparelhoResposta;

/** SQL dos aparelhos e da decisão de envio do push. */
@Repository
public class PushSql {

    private final JdbcTemplate jdbc;

    public PushSql(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ aparelhos

    /**
     * Registra ou atualiza o aparelho. O mesmo token com outro usuário (outra pessoa entrou no mesmo celular)
     * passa a ser deste usuário: notificação vai para quem está com a sessão no aparelho.
     */
    public AparelhoResposta registrar(long usuarioId, String token, String plataforma, Instant agora,
                                      boolean envioHabilitado) {
        return jdbc.queryForObject("""
                INSERT INTO push_aparelho (usuario_id, token, plataforma, criado_em, ultimo_uso_em, ativo)
                VALUES (?, ?, ?, ?, ?, true)
                ON CONFLICT ON CONSTRAINT uk_push_aparelho_token DO UPDATE
                    SET usuario_id = EXCLUDED.usuario_id, plataforma = EXCLUDED.plataforma,
                        ultimo_uso_em = EXCLUDED.ultimo_uso_em, ativo = true
                RETURNING id, plataforma, ativo, criado_em, ultimo_uso_em
                """, (rs, i) -> new AparelhoResposta(rs.getLong("id"), rs.getString("plataforma"),
                rs.getBoolean("ativo"), rs.getTimestamp("criado_em").toInstant(),
                rs.getTimestamp("ultimo_uso_em").toInstant(), envioHabilitado),
                usuarioId, token, plataforma, Timestamp.from(agora), Timestamp.from(agora));
    }

    /** Mantém só os {@code max} aparelhos ativos usados mais recentemente pelo usuário. */
    public int limitarAparelhos(long usuarioId, int max) {
        return jdbc.update("""
                UPDATE push_aparelho SET ativo = false
                WHERE usuario_id = ? AND ativo AND id NOT IN (
                    SELECT id FROM push_aparelho WHERE usuario_id = ? AND ativo
                    ORDER BY ultimo_uso_em DESC, id DESC LIMIT ?)
                """, usuarioId, usuarioId, max);
    }

    /** Remove o aparelho do usuário (ao sair). Token de outro usuário não é tocado. */
    public int remover(long usuarioId, String token) {
        return jdbc.update("DELETE FROM push_aparelho WHERE usuario_id = ? AND token = ?", usuarioId, token);
    }

    public long aparelhosAtivos() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM push_aparelho WHERE ativo", Long.class);
        return n == null ? 0 : n;
    }

    /** Tokens ativos de usuários ativos com um dos papéis. */
    public List<String> tokens(Collection<String> papeis) {
        String marcas = String.join(",", papeis.stream().map(p -> "?").toList());
        return jdbc.queryForList("""
                SELECT a.token FROM push_aparelho a JOIN usuario u ON u.id = a.usuario_id
                WHERE a.ativo AND u.ativo AND u.papel IN (%s)
                ORDER BY a.id
                """.formatted(marcas), String.class, papeis.toArray());
    }

    /** O Expo disse que o token não existe mais (app desinstalado ou notificação desligada). */
    public int desativar(String token) {
        return jdbc.update("UPDATE push_aparelho SET ativo = false WHERE token = ? AND ativo", token);
    }

    public void marcarUso(Collection<String> tokens, Instant agora) {
        if (tokens.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("UPDATE push_aparelho SET ultimo_uso_em = ? WHERE token = ?",
                tokens.stream().map(t -> new Object[] {Timestamp.from(agora), t}).toList());
    }

    // ------------------------------------------------------------------ decisão de envio

    /**
     * Grava a decisão de envio de uma origem (alerta ou OS): 'pendente' se pode enviar, 'intervalo' se o mesmo
     * ponto e tipo já teve push há menos de {@code intervaloMin}. Vazio quando a origem já tinha decisão (a
     * mesma ocorrência nunca gera um segundo push).
     */
    public Optional<Decisao> decidir(String tipo, Long alertaId, Long osId, boolean simulado, int intervaloMin,
                                     Instant agora) {
        String origem = osId != null ? "SELECT ponto_medicao_id FROM ordem_servico WHERE id = ?"
                : "SELECT ponto_medicao_id FROM alerta WHERE id = ?";
        Long pontoId = jdbc.query(origem, rs -> rs.next() ? rs.getLong(1) : null, osId != null ? osId : alertaId);
        if (pontoId == null) {
            return Optional.empty();
        }
        boolean recente = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM push_envio WHERE ponto_medicao_id = ? AND tipo = ? AND simulado = ?
                               AND resultado IN ('pendente', 'enviado', 'falhou') AND criado_em > ?)
                """, Boolean.class, pontoId, tipo, simulado,
                Timestamp.from(agora.minusSeconds(60L * intervaloMin))));
        String resultado = recente ? "intervalo" : "pendente";
        List<Long> id = jdbc.queryForList("""
                INSERT INTO push_envio (tipo, alerta_id, ordem_servico_id, ponto_medicao_id, simulado, resultado,
                                        criado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                RETURNING id
                """, Long.class, tipo, alertaId, osId, pontoId, simulado, resultado, Timestamp.from(agora));
        return id.isEmpty() ? Optional.empty() : Optional.of(new Decisao(id.get(0), !recente));
    }

    public record Decisao(long id, boolean enviar) {
    }

    public void concluir(long envioId, String resultado, int destinatarios) {
        jdbc.update("UPDATE push_envio SET resultado = ?, destinatarios = ? WHERE id = ?", resultado, destinatarios,
                envioId);
    }
}
