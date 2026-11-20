package br.senai.predictspin.telemetria;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.maquina.CanalRepository;

/**
 * Exporta os ensaios em CSV: uma linha por janela e ponto de ensaio válido (encerrado e não
 * descartado), com os rótulos do ensaio e uma coluna por canal. Escreve em fluxo: cada linha lida do
 * banco vai direto para a resposta.
 * <p>
 * Duas colunas dizem o que pode entrar no treino da classificação:
 * <ul>
 *   <li>{@code uso}: {@code treino} ou {@code validacao}, pela condição do ensaio (sensor_solto é
 *       validação do alerta de instrumento e nunca é classe de treino);</li>
 *   <li>{@code marca}: vazia para janela boa; {@code rapida} para janela de 1 s do modo rápido;
 *       {@code amostras_incompletas} quando chegaram menos de 98% das amostras esperadas. Com as duas,
 *       {@code rapida|amostras_incompletas}.</li>
 * </ul>
 * Conjunto de treino = {@code uso = treino}, {@code marca} vazia e {@code evento_marcado = false}.
 * <p>
 * Colunas acrescentadas no FIM (V5), depois das colunas de canal: a receita do corte
 * ({@code ferramenta}, {@code profundidade_corte_mm}, {@code diametro_peca_mm}, {@code fluido_corte}; o
 * material e o avanço já existiam) e {@code evento_marcado}: {@code true} na janela cujo intervalo
 * contém um evento marcado e na janela seguinte.
 * <p>
 * Acrescentadas no FIM pela V6, depois das da V5: {@code vel_rms_mm_s} (vazia quando o dispositivo não
 * mandou), {@code firmware_versao} e, do ponto da linha, {@code calibracao} (identificador) e {@code eixo}.
 * <p>
 * Canais criados depois da V8 (a V9 criou {@code nivel_som_db}) vão no FIM da linha, depois de {@code eixo}, em
 * ordem alfabética: nenhuma coluna existente muda de posição.
 */
@Service
public class ExportacaoService {

    static final List<String> COLUNAS_FIXAS = List.of("ensaio", "etapa", "condicao", "material",
            "rotacao_alvo_rpm", "avanco_alvo", "repeticao", "simulado", "maquina", "dispositivo", "janela_id",
            "medido_em", "rotacao_rpm", "saturou", "ponto", "papel", "rms_g", "pico_g", "curtose", "ordem_1x",
            "ordem_2x", "ordem_3x", "modo", "amostras", "amostras_esperadas", "uso", "marca");

    /** Canais que existiam até a V8: ficam no meio da linha, em ordem alfabética, como sempre. */
    static final java.util.Set<String> CANAIS_ATE_V8 = java.util.Set.of("amb_temp_c", "amb_umid_pct", "corrente_a",
            "temp_cabecote_c", "temp_ferramenta_c");

    /** Colunas do fim do arquivo, depois das de canal (acrescentadas sem mudar as anteriores). */
    static final List<String> COLUNAS_DO_FIM = List.of("ferramenta", "profundidade_corte_mm", "diametro_peca_mm",
            "fluido_corte", "evento_marcado", "vel_rms_mm_s", "firmware_versao", "calibracao", "eixo");

    /** Abaixo desta fração das amostras esperadas, a janela é marcada e fica fora do treino. */
    static final double FRACAO_MINIMA_AMOSTRAS = 0.98;
    static final String MARCA_RAPIDA = "rapida";
    static final String MARCA_AMOSTRAS_INCOMPLETAS = "amostras_incompletas";
    private static final int LINHAS_ENTRE_FLUSH = 1000;

    private final ExportacaoRepository repositorio;
    private final CanalRepository canais;

    public ExportacaoService(ExportacaoRepository repositorio, CanalRepository canais) {
        this.repositorio = repositorio;
        this.canais = canais;
    }

    /** Devolve o número de linhas de dados escritas (sem o cabeçalho). */
    @Transactional(readOnly = true)
    public long exportar(Boolean simulado, Long maquinaId, Writer saida) {
        List<String> todos = canais.codigos(maquinaId);
        // canais até a V8 continuam no meio, em ordem alfabética; os criados depois vão para o FIM da linha, para
        // nenhuma coluna existente mudar de posição (o contrato do CSV só cresce)
        List<String> codigosCanais = new ArrayList<>(todos.stream().filter(CANAIS_ATE_V8::contains).toList());
        List<String> canaisNovos = todos.stream().filter(c -> !CANAIS_ATE_V8.contains(c)).toList();
        List<String> cabecalho = new ArrayList<>(COLUNAS_FIXAS);
        cabecalho.addAll(codigosCanais);
        cabecalho.addAll(COLUNAS_DO_FIM);
        cabecalho.addAll(canaisNovos);
        escrever(saida, String.join(",", cabecalho));

        List<String> ordemNaConsulta = new ArrayList<>(codigosCanais);
        ordemNaConsulta.addAll(canaisNovos);
        long[] linhas = {0};
        repositorio.percorrer(ordemNaConsulta, simulado, maquinaId, rs -> {
            escrever(saida, linha(rs, codigosCanais.size(), canaisNovos.size()));
            if (++linhas[0] % LINHAS_ENTRE_FLUSH == 0) {
                descarregar(saida);
            }
        });
        descarregar(saida);
        return linhas[0];
    }

    private static String linha(ResultSet rs, int quantidadeCanais, int quantidadeNovos) throws SQLException {
        List<String> v = new ArrayList<>(COLUNAS_FIXAS.size() + quantidadeCanais + COLUNAS_DO_FIM.size());
        v.add(texto(rs.getString("ensaio")));
        v.add(rs.getString("etapa"));
        v.add(rs.getString("condicao"));
        v.add(texto(rs.getString("material")));
        v.add(rs.getString("rotacao_alvo_rpm"));
        v.add(nulo(rs.getBigDecimal("avanco_alvo")));
        v.add(rs.getString("repeticao"));
        v.add(String.valueOf(rs.getBoolean("simulado")));
        v.add(texto(rs.getString("maquina")));
        v.add(texto(rs.getString("dispositivo")));
        v.add(rs.getString("janela_id"));
        v.add(rs.getObject("medido_em", OffsetDateTime.class).toInstant().toString());
        v.add(numero(rs, "rotacao_rpm"));
        v.add(String.valueOf(rs.getBoolean("saturou")));
        v.add(texto(rs.getString("ponto")));
        v.add(rs.getString("papel"));
        v.add(numero(rs, "rms_g"));
        v.add(numero(rs, "pico_g"));
        v.add(numero(rs, "curtose"));
        v.add(numero(rs, "ordem_1x"));
        v.add(numero(rs, "ordem_2x"));
        v.add(numero(rs, "ordem_3x"));
        String modo = rs.getString("modo");
        Integer amostras = inteiro(rs, "amostras");
        Integer esperadas = inteiro(rs, "amostras_esperadas");
        v.add(modo);
        v.add(nulo(amostras));
        v.add(nulo(esperadas));
        v.add(Condicao.de(rs.getString("condicao")).uso().valor());
        v.add(marca(ModoJanela.de(modo), amostras, esperadas));
        for (int i = 0; i < quantidadeCanais; i++) {
            v.add(numero(rs, "canal_" + i));
        }
        v.add(texto(rs.getString("ferramenta")));
        v.add(decimal(rs.getBigDecimal("profundidade_corte_mm")));
        v.add(decimal(rs.getBigDecimal("diametro_peca_mm")));
        v.add(nulo(rs.getString("fluido_corte")));
        v.add(String.valueOf(rs.getBoolean("evento_marcado")));
        v.add(numero(rs, "vel_rms_mm_s"));
        v.add(texto(rs.getString("firmware_versao")));
        v.add(texto(rs.getString("calibracao_ponto")));
        v.add(nulo(rs.getString("eixo_ponto")));
        for (int i = 0; i < quantidadeNovos; i++) {
            v.add(numero(rs, "canal_" + (quantidadeCanais + i)));
        }
        return String.join(",", v);
    }

    /** Marca da janela no CSV: vazia quando a janela serve para treino. */
    static String marca(ModoJanela modo, Integer amostras, Integer esperadas) {
        List<String> marcas = new ArrayList<>(2);
        if (modo == ModoJanela.RAPIDO) {
            marcas.add(MARCA_RAPIDA);
        }
        if (amostras != null && esperadas != null && amostras < FRACAO_MINIMA_AMOSTRAS * esperadas) {
            marcas.add(MARCA_AMOSTRAS_INCOMPLETAS);
        }
        return String.join("|", marcas);
    }

    private static Integer inteiro(ResultSet rs, String coluna) throws SQLException {
        int valor = rs.getInt(coluna);
        return rs.wasNull() ? null : valor;
    }

    private static String numero(ResultSet rs, String coluna) throws SQLException {
        double valor = rs.getDouble(coluna);
        return rs.wasNull() ? "" : Double.toString(valor);
    }

    private static String decimal(java.math.BigDecimal valor) {
        return valor == null ? "" : valor.stripTrailingZeros().toPlainString();
    }

    private static String nulo(Object valor) {
        return valor == null ? "" : valor.toString();
    }

    /** Aspas quando o texto tem vírgula, aspas ou quebra de linha (RFC 4180). */
    static String texto(String valor) {
        if (valor == null) {
            return "";
        }
        if (valor.contains(",") || valor.contains("\"") || valor.contains("\n") || valor.contains("\r")) {
            return "\"" + valor.replace("\"", "\"\"") + "\"";
        }
        return valor;
    }

    private static void escrever(Writer saida, String linha) {
        try {
            saida.write(linha);
            saida.write("\n");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void descarregar(Writer saida) {
        try {
            saida.flush();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
