package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.StringWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowCallbackHandler;

import br.senai.predictspin.maquina.CanalRepository;

class ExportacaoServiceTest {

    private ExportacaoRepository repositorio;
    private CanalRepository canais;
    private ExportacaoService servico;

    @BeforeEach
    void criar() {
        repositorio = mock(ExportacaoRepository.class);
        canais = mock(CanalRepository.class);
        servico = new ExportacaoService(repositorio, canais);
    }

    /** Faz o repositório entregar as linhas dadas, uma a uma, ao callback do Service. */
    private void entregar(ResultSet... linhas) {
        doAnswer(chamada -> {
            RowCallbackHandler callback = chamada.getArgument(3);
            for (ResultSet rs : linhas) {
                callback.processRow(rs);
            }
            return null;
        }).when(repositorio).percorrer(any(), any(), any(), any());
    }

    private static ResultSet linha(String material, BigDecimal avanco, boolean correnteNula) throws SQLException {
        return linha(material, avanco, correnteNula, "normal", "normal", 8000, 8000);
    }

    private static ResultSet linha(String material, BigDecimal avanco, boolean correnteNula, String condicao,
                                   String modo, Integer amostras, Integer esperadas) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        // wasNull responde pela última coluna numérica lida, como o driver
        AtomicReference<String> ultima = new AtomicReference<>("");
        Set<String> nulas = new HashSet<>();
        if (amostras == null) {
            nulas.add("amostras");
        }
        if (esperadas == null) {
            nulas.add("amostras_esperadas");
        }
        if (correnteNula) {
            nulas.add("canal_0");
        }
        if (material == null) {
            nulas.add("vel_rms_mm_s");
        }
        when(rs.wasNull()).thenAnswer(i -> nulas.contains(ultima.get()));
        when(rs.getString("ensaio")).thenReturn("TORNO-01-T1-00001");
        when(rs.getString("etapa")).thenReturn("T1");
        when(rs.getString("condicao")).thenReturn(condicao);
        when(rs.getString("modo")).thenReturn(modo);
        numero(rs, ultima, "amostras", amostras == null ? 0 : amostras);
        numero(rs, ultima, "amostras_esperadas", esperadas == null ? 0 : esperadas);
        when(rs.getString("material")).thenReturn(material);
        if (material != null) {
            when(rs.getString("ferramenta")).thenReturn("Bit de metal duro");
            when(rs.getBigDecimal("profundidade_corte_mm")).thenReturn(new BigDecimal("1.500"));
            when(rs.getBigDecimal("diametro_peca_mm")).thenReturn(new BigDecimal("38.00"));
            when(rs.getString("fluido_corte")).thenReturn("emulsao");
            when(rs.getBoolean("evento_marcado")).thenReturn(true);
            when(rs.getString("firmware_versao")).thenReturn("2026-11-17+76951bf");
            when(rs.getString("calibracao_ponto")).thenReturn("A-20261117T143200Z");
            when(rs.getString("eixo_ponto")).thenReturn("z");
        }
        when(rs.getString("rotacao_alvo_rpm")).thenReturn("1200");
        when(rs.getBigDecimal("avanco_alvo")).thenReturn(avanco);
        when(rs.getString("repeticao")).thenReturn("1");
        when(rs.getBoolean("simulado")).thenReturn(true);
        when(rs.getString("maquina")).thenReturn("TORNO-01");
        when(rs.getString("dispositivo")).thenReturn("ps-sim-01");
        when(rs.getString("janela_id")).thenReturn("77");
        when(rs.getObject("medido_em", OffsetDateTime.class))
                .thenReturn(OffsetDateTime.parse("2026-11-10T12:00:05Z"));
        when(rs.getString("ponto")).thenReturn("A");
        when(rs.getString("papel")).thenReturn("acionamento");
        numero(rs, ultima, "rotacao_rpm", 1198.5);
        numero(rs, ultima, "rms_g", 0.12);
        numero(rs, ultima, "pico_g", 0.4);
        numero(rs, ultima, "curtose", 3.1);
        numero(rs, ultima, "ordem_1x", 0.08);
        numero(rs, ultima, "ordem_2x", 0.03);
        numero(rs, ultima, "ordem_3x", 0.01);
        numero(rs, ultima, "canal_0", correnteNula ? 0.0 : 4.5);
        numero(rs, ultima, "vel_rms_mm_s", material == null ? 0.0 : 1.85);
        return rs;
    }

    /** getInt e getDouble da coluna devolvem o valor e marcam a coluna como a última lida. */
    private static void numero(ResultSet rs, AtomicReference<String> ultima, String coluna, Number valor)
            throws SQLException {
        when(rs.getInt(coluna)).thenAnswer(i -> {
            ultima.set(coluna);
            return valor.intValue();
        });
        when(rs.getDouble(coluna)).thenAnswer(i -> {
            ultima.set(coluna);
            return valor.doubleValue();
        });
    }

    @Test
    void escreveCabecalhoComCanaisEUmaLinhaPorRegistro() throws SQLException {
        when(canais.codigos(1L)).thenReturn(List.of("corrente_a"));
        entregar(linha("aço SAE 1045, barra", new BigDecimal("0.150"), false), linha(null, null, true));
        StringWriter saida = new StringWriter();

        long linhas = servico.exportar(true, 1L, saida);

        assertThat(linhas).isEqualTo(2);
        String[] csv = saida.toString().split("\n");
        assertThat(csv).hasSize(3);
        // as colunas da V5 vêm no fim, depois das de canal
        assertThat(csv[0]).isEqualTo(String.join(",", ExportacaoService.COLUNAS_FIXAS) + ",corrente_a" + "," + String.join(",", ExportacaoService.COLUNAS_DO_FIM));
        assertThat(csv[1]).isEqualTo("TORNO-01-T1-00001,T1,normal,\"aço SAE 1045, barra\",1200,0.150,1,true,"
                + "TORNO-01,ps-sim-01,77,2026-11-10T12:00:05Z,1198.5,false,A,acionamento,"
                + "0.12,0.4,3.1,0.08,0.03,0.01,normal,8000,8000,treino,,4.5,Bit de metal duro,1.5,38,emulsao,true,"
                + "1.85,2026-11-17+76951bf,A-20261117T143200Z,z");
        // material, avanço e canal ausentes viram campo vazio
        assertThat(csv[2]).isEqualTo("TORNO-01-T1-00001,T1,normal,,1200,,1,true,"
                + "TORNO-01,ps-sim-01,77,2026-11-10T12:00:05Z,1198.5,false,A,acionamento,"
                + "0.12,0.4,3.1,0.08,0.03,0.01,normal,8000,8000,treino,,,,,,,false,,,,");
    }

    @Test
    void separaTreinoDeValidacaoEMarcaJanelasForaDoTreino() throws SQLException {
        when(canais.codigos(1L)).thenReturn(List.of());
        entregar(linha(null, null, false, "sensor_solto", "normal", 8000, 8000),
                linha(null, null, false, "desbalanceamento", "rapido", 1600, 1600),
                linha(null, null, false, "normal", "normal", 7839, 8000),
                linha(null, null, false, "normal", "rapido", 1500, 1600),
                linha(null, null, false, "normal", "normal", 7840, 8000),
                linha(null, null, false, "normal", "normal", null, null));
        StringWriter saida = new StringWriter();

        servico.exportar(true, 1L, saida);

        String[] csv = saida.toString().split("\n");
        assertThat(csv[1]).endsWith(",normal,8000,8000,validacao,,,,,,false,,,,");
        assertThat(csv[2]).endsWith(",rapido,1600,1600,treino,rapida,,,,,false,,,,");
        // 7839 < 98% de 8000 (7840): incompleta; 7840 já serve
        assertThat(csv[3]).endsWith(",normal,7839,8000,treino,amostras_incompletas,,,,,false,,,,");
        assertThat(csv[4]).endsWith(",rapido,1500,1600,treino,rapida|amostras_incompletas,,,,,false,,,,");
        assertThat(csv[5]).endsWith(",normal,7840,8000,treino,,,,,,false,,,,");
        // envio antigo, sem contagem: sem marca
        assertThat(csv[6]).endsWith(",normal,,,treino,,,,,,false,,,,");
    }

    @Test
    void marcaDaJanela() {
        assertThat(ExportacaoService.marca(ModoJanela.NORMAL, null, null)).isEmpty();
        assertThat(ExportacaoService.marca(ModoJanela.NORMAL, 100, null)).isEmpty();
        assertThat(ExportacaoService.marca(ModoJanela.NORMAL, 97, 100)).isEqualTo("amostras_incompletas");
        assertThat(ExportacaoService.marca(ModoJanela.NORMAL, 98, 100)).isEmpty();
        assertThat(ExportacaoService.marca(ModoJanela.RAPIDO, 98, 100)).isEqualTo("rapida");
    }

    @Test
    void semDadosSaiSoOCabecalhoERepassaOsFiltros() {
        when(canais.codigos(null)).thenReturn(List.of());
        StringWriter saida = new StringWriter();

        long linhas = servico.exportar(null, null, saida);

        assertThat(linhas).isZero();
        assertThat(saida.toString()).isEqualTo(String.join(",", ExportacaoService.COLUNAS_FIXAS) + "," + String.join(",", ExportacaoService.COLUNAS_DO_FIM) + "\n");
        org.mockito.Mockito.verify(repositorio).percorrer(eq(List.of()), eq(null), eq(null), any());
    }

    @Test
    void textoSegueARfc4180() {
        assertThat(ExportacaoService.texto(null)).isEmpty();
        assertThat(ExportacaoService.texto("simples")).isEqualTo("simples");
        assertThat(ExportacaoService.texto("a,b")).isEqualTo("\"a,b\"");
        assertThat(ExportacaoService.texto("diz \"oi\"")).isEqualTo("\"diz \"\"oi\"\"\"");
        assertThat(ExportacaoService.texto("duas\nlinhas")).isEqualTo("\"duas\nlinhas\"");
        assertThat(ExportacaoService.texto("retorno\rde carro")).isEqualTo("\"retorno\rde carro\"");
    }

    @Test
    void falhaDeEscritaViraExcecaoNaoVerificada() {
        when(canais.codigos(any())).thenReturn(List.of());
        Writer quebrado = new Writer() {
            @Override
            public void write(char[] cbuf, int off, int len) throws IOException {
                throw new IOException("conexão fechada pelo cliente");
            }

            @Override
            public void flush() {
            }

            @Override
            public void close() {
            }
        };

        assertThatThrownBy(() -> servico.exportar(null, null, quebrado)).isInstanceOf(UncheckedIOException.class);
    }

    @Test
    void descarregaASaidaACadaMilLinhasEAoFim() throws SQLException, IOException {
        when(canais.codigos(1L)).thenReturn(List.of());
        ResultSet[] linhas = new ResultSet[1001];
        for (int i = 0; i < linhas.length; i++) {
            linhas[i] = linha(null, null, false);
        }
        entregar(linhas);
        Writer saida = mock(Writer.class);

        assertThat(servico.exportar(true, 1L, saida)).isEqualTo(1001);

        verify(saida, times(2)).flush();  // na milésima linha e no fim
    }

    @Test
    void falhaAoDescarregarASaidaTambemViraExcecaoNaoVerificada() throws IOException {
        when(canais.codigos(1L)).thenReturn(List.of());
        entregar();
        Writer saida = mock(Writer.class);
        doThrow(new IOException("cliente fechou a conexão")).when(saida).flush();

        assertThatThrownBy(() -> servico.exportar(true, 1L, saida)).isInstanceOf(UncheckedIOException.class)
                .hasMessageContaining("cliente fechou");
    }
}
