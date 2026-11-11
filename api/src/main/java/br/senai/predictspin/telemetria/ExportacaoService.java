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
 * Conjunto de treino = {@code uso = treino} e {@code marca} vazia.
 */
@Service
public class ExportacaoService {

    static final List<String> COLUNAS_FIXAS = List.of("ensaio", "etapa", "condicao", "material",
            "rotacao_alvo_rpm", "avanco_alvo", "repeticao", "simulado", "maquina", "dispositivo", "janela_id",
            "medido_em", "rotacao_rpm", "saturou", "ponto", "papel", "rms_g", "pico_g", "curtose", "ordem_1x",
            "ordem_2x", "ordem_3x", "modo", "amostras", "amostras_esperadas", "uso", "marca");

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
        List<String> codigosCanais = canais.codigos(maquinaId);
        List<String> cabecalho = new ArrayList<>(COLUNAS_FIXAS);
        cabecalho.addAll(codigosCanais);
        escrever(saida, String.join(",", cabecalho));

        long[] linhas = {0};
        repositorio.percorrer(codigosCanais, simulado, maquinaId, rs -> {
            escrever(saida, linha(rs, codigosCanais.size()));
            if (++linhas[0] % LINHAS_ENTRE_FLUSH == 0) {
                descarregar(saida);
            }
        });
        descarregar(saida);
        return linhas[0];
    }

    private static String linha(ResultSet rs, int quantidadeCanais) throws SQLException {
        List<String> v = new ArrayList<>(COLUNAS_FIXAS.size() + quantidadeCanais);
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
