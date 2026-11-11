package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.StringWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;

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
        when(rs.getString("ensaio")).thenReturn("TORNO-01-T1-00001");
        when(rs.getString("etapa")).thenReturn("T1");
        when(rs.getString("condicao")).thenReturn(condicao);
        when(rs.getString("modo")).thenReturn(modo);
        when(rs.getInt("amostras")).thenReturn(amostras == null ? 0 : amostras);
        when(rs.getInt("amostras_esperadas")).thenReturn(esperadas == null ? 0 : esperadas);
        when(rs.getString("material")).thenReturn(material);
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
        when(rs.getDouble("rotacao_rpm")).thenReturn(1198.5);
        when(rs.getDouble("rms_g")).thenReturn(0.12);
        when(rs.getDouble("pico_g")).thenReturn(0.4);
        when(rs.getDouble("curtose")).thenReturn(3.1);
        when(rs.getDouble("ordem_1x")).thenReturn(0.08);
        when(rs.getDouble("ordem_2x")).thenReturn(0.03);
        when(rs.getDouble("ordem_3x")).thenReturn(0.01);
        when(rs.getDouble("canal_0")).thenReturn(correnteNula ? 0.0 : 4.5);
        // wasNull é consultado logo depois de cada getDouble e getInt, nesta ordem: rotação, 6 medidas,
        // amostras, amostras esperadas e canal_0
        when(rs.wasNull()).thenReturn(false, false, false, false, false, false, false, amostras == null,
                esperadas == null, correnteNula);
        return rs;
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
        assertThat(csv[0]).isEqualTo(String.join(",", ExportacaoService.COLUNAS_FIXAS) + ",corrente_a");
        assertThat(csv[1]).isEqualTo("TORNO-01-T1-00001,T1,normal,\"aço SAE 1045, barra\",1200,0.150,1,true,"
                + "TORNO-01,ps-sim-01,77,2026-11-10T12:00:05Z,1198.5,false,A,acionamento,"
                + "0.12,0.4,3.1,0.08,0.03,0.01,normal,8000,8000,treino,,4.5");
        // material, avanço e canal ausentes viram campo vazio
        assertThat(csv[2]).isEqualTo("TORNO-01-T1-00001,T1,normal,,1200,,1,true,"
                + "TORNO-01,ps-sim-01,77,2026-11-10T12:00:05Z,1198.5,false,A,acionamento,"
                + "0.12,0.4,3.1,0.08,0.03,0.01,normal,8000,8000,treino,,");
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
        assertThat(csv[1]).endsWith(",normal,8000,8000,validacao,");
        assertThat(csv[2]).endsWith(",rapido,1600,1600,treino,rapida");
        // 7839 < 98% de 8000 (7840): incompleta; 7840 já serve
        assertThat(csv[3]).endsWith(",normal,7839,8000,treino,amostras_incompletas");
        assertThat(csv[4]).endsWith(",rapido,1500,1600,treino,rapida|amostras_incompletas");
        assertThat(csv[5]).endsWith(",normal,7840,8000,treino,");
        // envio antigo, sem contagem: sem marca
        assertThat(csv[6]).endsWith(",normal,,,treino,");
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
        assertThat(saida.toString()).isEqualTo(String.join(",", ExportacaoService.COLUNAS_FIXAS) + "\n");
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
}
