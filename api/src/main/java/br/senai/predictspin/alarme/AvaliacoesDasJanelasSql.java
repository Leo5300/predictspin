package br.senai.predictspin.alarme;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.telemetria.AvaliacoesDasJanelas;
import br.senai.predictspin.telemetria.dto.UltimaJanelaResposta;

/** Avaliação de cada ponto das janelas, para as listagens e o evento "janela" (uma consulta por página). */
@Repository
public class AvaliacoesDasJanelasSql implements AvaliacoesDasJanelas {

    private static final String[] COLUNAS_Z = {"z_rms", "z_pico", "z_curtose", "z_o1x", "z_o2x", "z_o3x", "z_vel"};

    private final JdbcTemplate jdbc;

    public AvaliacoesDasJanelasSql(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<Long, Map<Long, UltimaJanelaResposta.Avaliacao>> das(Collection<Long> janelaIds) {
        Map<Long, Map<Long, UltimaJanelaResposta.Avaliacao>> saida = new HashMap<>();
        if (janelaIds.isEmpty()) {
            return saida;
        }
        List<Long> ids = List.copyOf(janelaIds);
        String marcas = String.join(",", ids.stream().map(id -> "?").toList());
        jdbc.query("SELECT * FROM avaliacao WHERE janela_id IN (" + marcas + ")", rs -> {
            Map<String, Double> z = new LinkedHashMap<>();
            for (Medida m : Medida.values()) {
                Object valor = rs.getObject(COLUNAS_Z[m.ordinal()]);
                if (valor != null) {
                    z.put(m.valor(), ((Number) valor).doubleValue());
                }
            }
            Object estado = rs.getObject("estado");
            saida.computeIfAbsent(rs.getLong("janela_id"), k -> new HashMap<>()).put(rs.getLong("ponto_medicao_id"),
                    new UltimaJanelaResposta.Avaliacao(Situacao.doCodigo(rs.getShort("situacao")).valor(),
                            estado == null ? null : Nivel.doCodigo(((Number) estado).intValue()).valor(),
                            rs.getString("etapa_ref"), rs.getBoolean("generica"), z));
        }, ids.toArray());
        return saida;
    }
}
