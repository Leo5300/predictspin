package br.senai.predictspin.alerta;

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

import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alerta.dto.AlertaDetalheResposta;
import br.senai.predictspin.alerta.dto.AlertaResposta;
import br.senai.predictspin.comum.EnumComValor;

/** SQL dos alertas da regra (ISA-18.2) e do seu histórico. */
@Repository
public class AlertaSql {

    private static final String SELECT = """
            SELECT a.*, m.codigo AS maquina_codigo, pm.codigo AS ponto_codigo, c.tipo AS componente_tipo,
                   v.numero AS versao_numero, ur.nome AS reconhecido_por, us.nome AS suprimido_por,
                   (SELECT os.id FROM ordem_servico os WHERE os.alerta_id = a.id) AS ordem_servico_id
            FROM alerta a
            JOIN maquina m ON m.id = a.maquina_id
            JOIN ponto_medicao pm ON pm.id = a.ponto_medicao_id
            LEFT JOIN componente c ON c.id = a.componente_id
            LEFT JOIN referencia_versao v ON v.id = a.referencia_versao_id
            LEFT JOIN usuario ur ON ur.id = a.reconhecido_por_id
            LEFT JOIN usuario us ON us.id = a.suprimido_por_id
            """;

    private final JdbcTemplate jdbc;

    public AlertaSql(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** O que a regra precisa saber do alerta em aberto de um ponto. */
    public record EmAberto(long id, EstadoAlerta estado, Nivel nivel, Double piorZ, Instant normalizadoEm,
                           Instant reconhecidoEm) {
    }

    /** Alerta em aberto (ativo ou suprimido) do ponto, travado até o fim da transação. */
    public Optional<EmAberto> emAberto(long pontoId, String tipo, boolean simulado) {
        return jdbc.query("""
                SELECT id, estado, nivel, pior_z, normalizado_em, reconhecido_em FROM alerta
                WHERE ponto_medicao_id = ? AND tipo = ? AND simulado = ?
                  AND estado IN ('ativo_nao_reconhecido', 'ativo_reconhecido', 'suprimido')
                FOR UPDATE
                """, (rs, i) -> emAberto(rs), pontoId, tipo, simulado).stream().findFirst();
    }

    public Optional<EmAberto> travar(long id) {
        return jdbc.query("SELECT id, estado, nivel, pior_z, normalizado_em, reconhecido_em FROM alerta"
                + " WHERE id = ? FOR UPDATE", (rs, i) -> emAberto(rs), id).stream().findFirst();
    }

    private static EmAberto emAberto(ResultSet rs) throws SQLException {
        return new EmAberto(rs.getLong("id"), EstadoAlerta.de(rs.getString("estado")), nivel(rs.getString("nivel")),
                (Double) rs.getObject("pior_z"), instante(rs, "normalizado_em"), instante(rs, "reconhecido_em"));
    }

    /** Papel do ponto e componente provável (para a ação recomendada e o componente). */
    public record Ponto(String papel, Long componenteId) {
    }

    public Ponto ponto(long pontoId) {
        return jdbc.queryForObject("""
                SELECT pm.papel, c.id AS componente_id FROM ponto_medicao pm
                LEFT JOIN componente c ON c.ponto_medicao_id = pm.id
                WHERE pm.id = ?
                """, (rs, i) -> new Ponto(rs.getString("papel"), (Long) rs.getObject("componente_id")), pontoId);
    }

    /** Ação mais específica para o tipo, o papel do ponto e a medida dominante ("*" vale para qualquer). */
    public String acao(String tipo, String papel, String medida) {
        return jdbc.query("""
                SELECT texto FROM acao_recomendada
                WHERE tipo = ? AND papel IN (?, '*') AND medida IN (?, '*')
                ORDER BY (papel = '*'), (medida = '*')
                LIMIT 1
                """, (rs, i) -> rs.getString(1), tipo, papel, medida).stream().findFirst()
                .orElseThrow(() -> new IllegalStateException("Sem ação recomendada para " + tipo + "/" + papel
                        + "/" + medida + ": alarme sem ação é evento, não alarme (V7 semeia a tabela)"));
    }

    /** Dados de um alerta novo. */
    public record Novo(long maquinaId, long janelaId, long pontoId, String tipo, Nivel nivel, String metrica,
                       double valor, Double z, String explicacao, String acao, Long componenteId, Long versaoId,
                       String firmwareVersao, String calibracao, Long ensaioId, String condicaoEnsaio,
                       boolean simulado, Instant criadoEm) {
    }

    public long inserir(Novo n) {
        return jdbc.queryForObject("""
                INSERT INTO alerta (maquina_id, janela_id, ponto_medicao_id, metrica, valor, desvio_sigma, severidade,
                                    tipo, estado, nivel, pior_nivel, pior_z, explicacao, acao_recomendada,
                                    componente_id, referencia_versao_id, firmware_versao, calibracao, ensaio_id,
                                    condicao_ensaio, simulado, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo_nao_reconhecido', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, n.maquinaId(), n.janelaId(), n.pontoId(), n.metrica(), n.valor(), n.z(),
                prioridade(n.tipo(), n.nivel()), n.tipo(), n.nivel().valor(), n.nivel().valor(), n.z(), n.explicacao(),
                n.acao(), n.componenteId(), n.versaoId(), n.firmwareVersao(), n.calibracao(), n.ensaioId(),
                n.condicaoEnsaio(), n.simulado(), utc(n.criadoEm()), utc(n.criadoEm()));
    }

    /** Prioridade (coluna "severidade" da V1): ALARME = alta; ATENÇÃO e instrumento = baixa. */
    static String prioridade(String tipo, Nivel nivel) {
        return "maquina".equals(tipo) && nivel == Nivel.ALARME ? "alta" : "baixa";
    }

    /**
     * Nova medição do alerta de máquina: nível atual, pior nível, z, explicação e ação. A prioridade segue o
     * nível ATUAL (volta a baixa quando o ponto cai de alarme para atenção); o pior nível alcançado fica em
     * pior_nivel e o maior z em pior_z.
     */
    public void atualizarMedicao(long id, Nivel nivel, String metrica, double valor, Double z, String explicacao,
                                 String acao, Instant agora) {
        jdbc.update("""
                UPDATE alerta SET nivel = ?, severidade = CASE WHEN ? = 'alarme' THEN 'alta' ELSE 'baixa' END,
                       pior_nivel = CASE WHEN ? = 'alarme' THEN 'alarme' ELSE pior_nivel END,
                       metrica = ?, valor = ?, desvio_sigma = ?, pior_z = greatest(coalesce(pior_z, ?), ?),
                       explicacao = coalesce(?, explicacao), acao_recomendada = ?, atualizado_em = ?,
                       normalizado_em = NULL
                WHERE id = ?
                """, nivel.valor(), nivel.valor(), nivel.valor(), metrica, valor, z, z, z, explicacao, acao, utc(agora),
                id);
    }

    /** Muda o estado (e o que vier junto: normalizado, reconhecido, encerrado, supressão). */
    public void mudarEstado(long id, EstadoAlerta estado, Instant agora) {
        jdbc.update("UPDATE alerta SET estado = ?, atualizado_em = ?, encerrado_em = CASE WHEN ? = 'encerrado' "
                + "THEN ? ELSE encerrado_em END WHERE id = ?", estado.valor(), utc(agora), estado.valor(), utc(agora),
                id);
    }

    public void normalizar(long id, Instant agora) {
        jdbc.update("UPDATE alerta SET normalizado_em = ?, atualizado_em = ? WHERE id = ?", utc(agora), utc(agora), id);
    }

    public void reconhecer(long id, long usuarioId, Instant agora) {
        jdbc.update("UPDATE alerta SET reconhecido_em = ?, reconhecido_por_id = ?, atualizado_em = ? WHERE id = ?",
                utc(agora), usuarioId, utc(agora), id);
    }

    public void suprimir(long id, long usuarioId, String motivo, Instant ate, Instant agora) {
        jdbc.update("""
                UPDATE alerta SET estado = 'suprimido', suprimido_ate = ?, motivo_supressao = ?, suprimido_por_id = ?,
                                  atualizado_em = ?
                WHERE id = ?
                """, utc(ate), motivo, usuarioId, utc(agora), id);
    }

    public void historico(long alertaId, String acao, EstadoAlerta estado, Nivel nivel, Long usuarioId,
                          String detalhe, Instant agora) {
        jdbc.update("""
                INSERT INTO alerta_historico (alerta_id, acao, estado, nivel, usuario_id, detalhe, ocorrido_em)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, alertaId, acao, estado.valor(), nivel.valor(), usuarioId, detalhe, utc(agora));
    }

    public List<Long> supressoesVencidas(Instant agora) {
        return jdbc.queryForList("SELECT id FROM alerta WHERE estado = 'suprimido' AND suprimido_ate <= ? ORDER BY id",
                Long.class, utc(agora));
    }

    // ------------------------------------------------------------------ consultas

    public Optional<AlertaResposta> buscar(long id) {
        return jdbc.query(SELECT + " WHERE a.id = ?", (rs, i) -> resposta(rs), id).stream().findFirst();
    }

    public List<AlertaDetalheResposta.Mudanca> historicoDe(long alertaId) {
        return jdbc.query("""
                SELECT h.acao, h.estado, h.nivel, u.nome, h.detalhe, h.ocorrido_em FROM alerta_historico h
                LEFT JOIN usuario u ON u.id = h.usuario_id
                WHERE h.alerta_id = ? ORDER BY h.id
                """, (rs, i) -> new AlertaDetalheResposta.Mudanca(rs.getString("acao"),
                EstadoAlerta.de(rs.getString("estado")), nivel(rs.getString("nivel")), rs.getString("nome"),
                rs.getString("detalhe"), instante(rs, "ocorrido_em")), alertaId);
    }

    /** Filtros da listagem; todos opcionais. */
    public record Filtro(Long maquinaId, EstadoAlerta estado, String ponto, String prioridade, String tipo,
                         Boolean simulado, Instant de, Instant ate) {
    }

    public List<AlertaResposta> listar(Filtro f, int limite, long deslocamento) {
        List<Object> parametros = new ArrayList<>();
        String onde = onde(f, parametros);
        parametros.add(limite);
        parametros.add(deslocamento);
        return jdbc.query(SELECT + onde + """
                 ORDER BY (a.estado IN ('ativo_nao_reconhecido', 'normalizado_nao_reconhecido')) DESC,
                          a.criado_em DESC, a.id DESC
                 LIMIT ? OFFSET ?
                """, (rs, i) -> resposta(rs), parametros.toArray());
    }

    public long contar(Filtro f) {
        List<Object> parametros = new ArrayList<>();
        String onde = onde(f, parametros);
        return jdbc.queryForObject("SELECT count(*) FROM alerta a JOIN ponto_medicao pm ON pm.id = a.ponto_medicao_id"
                + onde, Long.class, parametros.toArray());
    }

    private static String onde(Filtro f, List<Object> p) {
        StringBuilder sql = new StringBuilder(" WHERE a.ponto_medicao_id IS NOT NULL");
        if (f.maquinaId() != null) {
            sql.append(" AND a.maquina_id = ?");
            p.add(f.maquinaId());
        }
        if (f.estado() != null) {
            sql.append(" AND a.estado = ?");
            p.add(f.estado().valor());
        }
        if (f.ponto() != null) {
            sql.append(" AND pm.codigo = ?");
            p.add(f.ponto());
        }
        if (f.prioridade() != null) {
            sql.append(" AND a.severidade = ?");
            p.add(f.prioridade());
        }
        if (f.tipo() != null) {
            sql.append(" AND a.tipo = ?");
            p.add(f.tipo());
        }
        if (f.simulado() != null) {
            sql.append(" AND a.simulado = ?");
            p.add(f.simulado());
        }
        if (f.de() != null) {
            sql.append(" AND a.criado_em >= ?");
            p.add(utc(f.de()));
        }
        if (f.ate() != null) {
            sql.append(" AND a.criado_em < ?");
            p.add(utc(f.ate()));
        }
        return sql.toString();
    }

    private static AlertaResposta resposta(ResultSet rs) throws SQLException {
        String condicao = rs.getString("condicao_ensaio");
        return new AlertaResposta(rs.getLong("id"), rs.getLong("maquina_id"), rs.getString("maquina_codigo"),
                rs.getString("ponto_codigo"), rs.getString("tipo"), rs.getString("severidade"),
                EstadoAlerta.de(rs.getString("estado")), nivel(rs.getString("nivel")),
                nivel(rs.getString("pior_nivel")), (Double) rs.getObject("desvio_sigma"),
                (Double) rs.getObject("pior_z"), rs.getString("metrica"), rs.getDouble("valor"),
                rs.getString("explicacao"), rs.getString("acao_recomendada"), rs.getString("componente_tipo"),
                (Integer) rs.getObject("versao_numero"), rs.getString("firmware_versao"), rs.getString("calibracao"),
                (Long) rs.getObject("ensaio_id"), condicao, condicao != null && !"normal".equals(condicao),
                rs.getBoolean("simulado"), rs.getLong("janela_id"), instante(rs, "criado_em"),
                instante(rs, "atualizado_em"), instante(rs, "reconhecido_em"), rs.getString("reconhecido_por"),
                instante(rs, "normalizado_em"), instante(rs, "encerrado_em"), instante(rs, "suprimido_ate"),
                rs.getString("motivo_supressao"), rs.getString("suprimido_por"),
                (Long) rs.getObject("ordem_servico_id"));
    }

    // ------------------------------------------------------------------ indicadores

    /** Alertas que contam nos indicadores: fora de ensaio de condição. */
    private static final String CONTAM = "a.maquina_id = ? AND a.simulado = ? AND a.ponto_medicao_id IS NOT NULL"
            + " AND (a.condicao_ensaio IS NULL OR a.condicao_ensaio = 'normal')";

    public long contarDesde(long maquinaId, boolean simulado, Instant desde) {
        return jdbc.queryForObject("SELECT count(*) FROM alerta a WHERE " + CONTAM + " AND a.criado_em >= ?",
                Long.class, maquinaId, simulado, utc(desde));
    }

    /** Maior número de alertas abertos dentro de uma mesma janela de {@code minutos} desde {@code desde}. */
    public long piorJanela(long maquinaId, boolean simulado, Instant desde, int minutos) {
        Long n = jdbc.queryForObject("""
                SELECT coalesce(max(qtd), 0) FROM (
                    SELECT (SELECT count(*) FROM alerta b
                            WHERE b.maquina_id = a.maquina_id AND b.simulado = a.simulado
                              AND b.ponto_medicao_id IS NOT NULL
                              AND (b.condicao_ensaio IS NULL OR b.condicao_ensaio = 'normal')
                              AND b.criado_em >= a.criado_em
                              AND b.criado_em < a.criado_em + make_interval(mins => ?)) AS qtd
                    FROM alerta a WHERE""" + " " + CONTAM + " AND a.criado_em >= ?) s",
                Long.class, minutos, maquinaId, simulado, utc(desde));
        return n == null ? 0 : n;
    }

    /** Pontos (código) em que o mesmo tipo de alerta abriu {@code vezes} ou mais dentro de {@code minutos}. */
    public List<String> repetitivos(long maquinaId, boolean simulado, Instant desde, int minutos, int vezes) {
        return jdbc.queryForList("""
                SELECT DISTINCT pm.codigo FROM alerta a
                JOIN ponto_medicao pm ON pm.id = a.ponto_medicao_id
                WHERE""" + " " + CONTAM + """
                 AND a.criado_em >= ?
                  AND (SELECT count(*) FROM alerta b
                       WHERE b.ponto_medicao_id = a.ponto_medicao_id AND b.tipo = a.tipo AND b.simulado = a.simulado
                         AND (b.condicao_ensaio IS NULL OR b.condicao_ensaio = 'normal')
                         AND b.criado_em >= a.criado_em
                         AND b.criado_em < a.criado_em + make_interval(mins => ?)) >= ?
                ORDER BY pm.codigo
                """, String.class, maquinaId, simulado, utc(desde), minutos, vezes);
    }

    public long parados(long maquinaId, boolean simulado, Instant antesDe) {
        return jdbc.queryForObject("SELECT count(*) FROM alerta a WHERE " + CONTAM
                + " AND a.estado IN ('ativo_nao_reconhecido', 'ativo_reconhecido') AND a.criado_em < ?",
                Long.class, maquinaId, simulado, utc(antesDe));
    }

    public long suprimidos(long maquinaId, boolean simulado) {
        return jdbc.queryForObject("SELECT count(*) FROM alerta a WHERE " + CONTAM + " AND a.estado = 'suprimido'",
                Long.class, maquinaId, simulado);
    }

    static Nivel nivel(String valor) {
        return EnumComValor.de(Nivel.class, valor);
    }

    private static Instant instante(ResultSet rs, String coluna) throws SQLException {
        OffsetDateTime valor = rs.getObject(coluna, OffsetDateTime.class);
        return valor == null ? null : valor.toInstant();
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante == null ? null : instante.atOffset(ZoneOffset.UTC);
    }
}
