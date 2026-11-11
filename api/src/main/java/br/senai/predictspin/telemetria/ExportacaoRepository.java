package br.senai.predictspin.telemetria;

import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;

/**
 * Consulta da exportação de ensaios: uma linha por janela e ponto, com os rótulos do ensaio e uma
 * coluna por canal. Lida com cursor (fetch size) para não carregar o resultado inteiro na memória;
 * precisa rodar dentro de transação para o driver do PostgreSQL usar cursor.
 */
@Repository
public class ExportacaoRepository {

    static final int LINHAS_POR_BUSCA = 500;

    private final JdbcTemplate jdbc;

    public ExportacaoRepository(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.jdbc.setFetchSize(LINHAS_POR_BUSCA);
    }

    public void percorrer(List<String> codigosCanais, Boolean simulado, Long maquinaId, RowCallbackHandler linha) {
        List<String> colunas = new ArrayList<>();
        for (int i = 0; i < codigosCanais.size(); i++) {
            colunas.add("max(l.valor) FILTER (WHERE c.codigo = ?) AS canal_" + i);
        }
        String colunasCanais = String.join(", ", colunas);
        String sql = """
                SELECT e.codigo AS ensaio, e.etapa, e.condicao, e.material, e.rotacao_alvo_rpm, e.avanco_alvo,
                       e.repeticao, e.simulado, m.codigo AS maquina, d.identificador AS dispositivo,
                       j.id AS janela_id, j.medido_em, j.rotacao_rpm, j.saturou,
                       j.modo, j.amostras, j.amostras_esperadas,
                       p.codigo AS ponto, p.papel, t.rms_g, t.pico_g, t.curtose, t.ordem_1x, t.ordem_2x, t.ordem_3x
                       %s
                FROM ensaio e
                JOIN maquina m ON m.id = e.maquina_id
                JOIN janela j ON j.ensaio_id = e.id
                JOIN dispositivo d ON d.id = j.dispositivo_id
                JOIN telemetria t ON t.janela_id = j.id
                JOIN ponto_medicao p ON p.id = t.ponto_medicao_id
                %s
                WHERE e.descartado = false
                  AND e.encerrado_em IS NOT NULL
                  AND (CAST(? AS boolean) IS NULL OR e.simulado = CAST(? AS boolean))
                  AND (CAST(? AS bigint) IS NULL OR e.maquina_id = CAST(? AS bigint))
                ORDER BY e.id, j.medido_em, p.codigo
                """.formatted(
                codigosCanais.isEmpty() ? "" : ", lc.*",
                codigosCanais.isEmpty() ? "" : """
                        LEFT JOIN LATERAL (
                            SELECT %s
                            FROM leitura l JOIN canal c ON c.id = l.canal_id
                            WHERE l.janela_id = j.id
                        ) lc ON true
                        """.formatted(colunasCanais));
        List<Object> parametros = new ArrayList<>(codigosCanais);
        parametros.add(simulado);
        parametros.add(simulado);
        parametros.add(maquinaId);
        parametros.add(maquinaId);
        jdbc.query(sql, linha, parametros.toArray());
    }
}
