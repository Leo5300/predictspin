package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.IntegracaoBase;

/**
 * Campos da V6: velocidade RMS por ponto e, na janela, versão do firmware, calibração e eixo de cada
 * ponto. Tudo opcional: o envio antigo continua valendo e as consultas só ganham a velocidade.
 */
class RastreabilidadeIntegracaoTest extends IntegracaoBase {

    private final Instant base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(120);
    private String admin;

    @BeforeEach
    void entrar() throws Exception {
        admin = tokenAdmin();
    }

    /** Envio do firmware novo: velocidade em A e B (C na primeira janela, sem velocidade) e rastreabilidade. */
    private Map<String, Object> completo(String dispositivo, Instant medidoEm) {
        Map<String, Object> corpo = payload(dispositivo, medidoEm);
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> pontos = (Map<String, Map<String, Object>>) corpo.get("pontos");
        pontos.get("A").put("vel_rms_mm_s", 1.85);
        pontos.get("B").put("vel_rms_mm_s", 0.0);
        corpo.put("firmware_versao", "2026-11-17+76951bf");
        corpo.put("calibracao", Map.of("A", "A-20261117T143200Z", "B", "nominal", "C", "C-semhora-3"));
        corpo.put("eixos", Map.of("A", "z", "B", "z", "C", "x"));
        return corpo;
    }

    @Test
    void envioCompletoGravaVelocidadeERastreabilidade() throws Exception {
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, completo(DISPOSITIVO_REAL, base)).andExpect(status().isCreated());

        Map<String, Object> janela = jdbc.queryForMap("SELECT firmware_versao, calibracao, eixos FROM janela");
        assertThat(janela.get("firmware_versao")).isEqualTo("2026-11-17+76951bf");
        assertThat(janela.get("calibracao"))
                .isEqualTo("{\"A\":\"A-20261117T143200Z\",\"B\":\"nominal\",\"C\":\"C-semhora-3\"}");
        assertThat(janela.get("eixos")).isEqualTo("{\"A\":\"z\",\"B\":\"z\",\"C\":\"x\"}");
        List<Double> velocidades = jdbc.queryForList("""
                SELECT t.vel_rms_mm_s FROM telemetria t JOIN ponto_medicao p ON p.id = t.ponto_medicao_id
                ORDER BY p.codigo
                """, Double.class);
        assertThat(velocidades).containsExactly(1.85, 0.0, null);
    }

    @Test
    void envioAntigoContinuaValendoComOsCamposNovosNulos() throws Exception {
        enviarReal(base).andExpect(status().isCreated());

        Map<String, Object> janela = jdbc.queryForMap("SELECT firmware_versao, calibracao, eixos FROM janela");
        assertThat(janela.values()).containsOnlyNulls();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM telemetria WHERE vel_rms_mm_s IS NOT NULL", Long.class))
                .isZero();
    }

    @Test
    void consultasMostramAVelocidadeSoOndeElaVeio() throws Exception {
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, completo(DISPOSITIVO_SIM, base)).andExpect(status().isCreated());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, completo(DISPOSITIVO_SIM, base.plusSeconds(5))).andExpect(status().isCreated());

        JsonNode ultima = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela"), admin))
                .andExpect(status().isOk()));
        assertThat(ultima.at("/pontos/A/vel_rms_mm_s").asDouble()).isEqualTo(1.85);
        assertThat(ultima.at("/pontos/B/vel_rms_mm_s").asDouble()).isZero();
        assertThat(ultima.at("/pontos/C").has("vel_rms_mm_s")).isFalse();

        JsonNode janelas = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/janelas"), admin))
                .andExpect(status().isOk()));
        assertThat(janelas.at("/conteudo/0/pontos/A/vel_rms_mm_s").asDouble()).isEqualTo(1.85);

        Long pontoA = jdbc.queryForObject("SELECT id FROM ponto_medicao WHERE maquina_id = ? AND codigo = 'A'",
                Long.class, maquinaId);
        JsonNode serie = corpo(mvc.perform(comToken(get("/api/v1/pontos/" + pontoA + "/telemetria"), admin))
                .andExpect(status().isOk()));
        assertThat(serie.at("/conteudo/0/vel_rms_mm_s").asDouble()).isEqualTo(1.85);

        JsonNode agregada = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/serie?baldes=1&de="
                + base.minusSeconds(10) + "&ate=" + base.plusSeconds(60)), admin)).andExpect(status().isOk()));
        JsonNode a = agregada.at("/intervalos/0/pontos/A");
        assertThat(a.get("vel_rms_media_mm_s").asDouble()).isEqualTo(1.85);
        assertThat(a.get("vel_rms_max_mm_s").asDouble()).isEqualTo(1.85);
        assertThat(agregada.at("/intervalos/0/pontos/C").has("vel_rms_media_mm_s")).isFalse();
    }

    @Test
    void camposNovosForaDaRegraSaoRecusadosCom400() throws Exception {
        var eixoInvalido = completo(DISPOSITIVO_REAL, base);
        eixoInvalido.put("eixos", Map.of("A", "w"));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, eixoInvalido).andExpect(status().isBadRequest());

        var calibracaoComEspaco = completo(DISPOSITIVO_REAL, base);
        calibracaoComEspaco.put("calibracao", Map.of("A", "calibrado ontem"));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, calibracaoComEspaco).andExpect(status().isBadRequest());

        var calibracaoLonga = completo(DISPOSITIVO_REAL, base);
        calibracaoLonga.put("calibracao", Map.of("A", "x".repeat(41)));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, calibracaoLonga).andExpect(status().isBadRequest());

        var versaoLonga = completo(DISPOSITIVO_REAL, base);
        versaoLonga.put("firmware_versao", "v".repeat(41));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, versaoLonga).andExpect(status().isBadRequest());

        var velocidadeNegativa = completo(DISPOSITIVO_REAL, base);
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> pontos = (Map<String, Map<String, Object>>) velocidadeNegativa.get("pontos");
        pontos.get("A").put("vel_rms_mm_s", -0.1);
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, velocidadeNegativa).andExpect(status().isBadRequest());

        var pontoDesconhecido = completo(DISPOSITIVO_REAL, base);
        pontoDesconhecido.put("calibracao", Map.of("Z", "nominal"));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, pontoDesconhecido).andExpect(status().isBadRequest());

        assertThat(contar("janela")).isZero();
    }

    @Test
    void exportacaoGanhaAsColunasNovasNoFimSemMexerNasAnteriores() throws Exception {
        long ensaioId = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":900,\"simulado\":true}"))
                .andExpect(status().isCreated())).get("id").asLong();
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, completo(DISPOSITIVO_SIM, base)).andExpect(status().isCreated());
        enviarSimulado(base.plusSeconds(5)).andExpect(status().isCreated());
        mvc.perform(comToken(post("/api/v1/ensaios/" + ensaioId + "/encerrar"), admin)).andExpect(status().isOk());

        String csv = mvc.perform(comToken(get("/api/v1/ensaios/exportar.csv?simulado=true"), admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String[] linhas = csv.split("\n");
        List<String> cabecalho = List.of(linhas[0].split(",", -1));
        assertThat(String.join(",", cabecalho.subList(0, ExportacaoService.COLUNAS_FIXAS.size())))
                .isEqualTo(String.join(",", ExportacaoService.COLUNAS_FIXAS));
        assertThat(cabecalho.subList(cabecalho.size() - 4, cabecalho.size()))
                .containsExactly("vel_rms_mm_s", "firmware_versao", "calibracao", "eixo");
        assertThat(cabecalho.indexOf("evento_marcado")).isEqualTo(cabecalho.size() - 5);

        int ponto = cabecalho.indexOf("ponto");
        // 1ª janela: A, B e C com rastreabilidade; 2ª janela (envio antigo): colunas novas vazias
        String[] a = linhas[1].split(",", -1);
        assertThat(a[ponto]).isEqualTo("A");
        assertThat(List.of(a).subList(a.length - 4, a.length))
                .containsExactly("1.85", "2026-11-17+76951bf", "A-20261117T143200Z", "z");
        String[] c = linhas[3].split(",", -1);
        assertThat(c[ponto]).isEqualTo("C");
        assertThat(List.of(c).subList(c.length - 4, c.length))
                .containsExactly("", "2026-11-17+76951bf", "C-semhora-3", "x");
        String[] antiga = linhas[4].split(",", -1);
        assertThat(List.of(antiga).subList(antiga.length - 4, antiga.length)).containsExactly("", "", "", "");
    }
}
