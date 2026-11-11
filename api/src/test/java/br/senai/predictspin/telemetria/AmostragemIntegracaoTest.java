package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.IntegracaoBase;

/** Campos opcionais do firmware de 3 sensores (modo, amostras) e condições novas de ensaio (V3). */
class AmostragemIntegracaoTest extends IntegracaoBase {

    private final Instant medidoEm = Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(600);
    private String tecnico;

    @BeforeEach
    void preparar() throws Exception {
        tecnico = tokenDe("TECNICO");
    }

    private Map<String, Object> comAmostragem(Instant instante, String modo, Integer amostras, Integer esperadas) {
        var p = payload(DISPOSITIVO_SIM, instante);
        if (modo != null) {
            p.put("modo", modo);
        }
        p.put("amostras", amostras);
        p.put("amostras_esperadas", esperadas);
        return p;
    }

    private long abrirSimulado(String condicao) throws Exception {
        String corpo = json.writeValueAsString(Map.of("etapa", "T1", "condicao", condicao, "rotacao_alvo_rpm", 800,
                "simulado", true));
        return corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                .contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()))
                .get("id").asLong();
    }

    private void encerrar(long id) throws Exception {
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/encerrar"), tecnico)).andExpect(status().isOk());
    }

    @Test
    void modoEAmostrasSaoGravadosNaJanelaEAparecemNaUltimaJanela() throws Exception {
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm, "rapido", 1598, 1600))
                .andExpect(status().isCreated());

        Map<String, Object> janela = jdbc.queryForMap("SELECT modo, amostras, amostras_esperadas FROM janela");
        assertThat(janela).containsEntry("modo", "rapido").containsEntry("amostras", 1598)
                .containsEntry("amostras_esperadas", 1600);

        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modo").value("rapido"))
                .andExpect(jsonPath("$.amostras").value(1598))
                .andExpect(jsonPath("$.amostras_esperadas").value(1600));
    }

    @Test
    void envioAntigoSemOsCamposNovosContinuaValidoEFicaNormal() throws Exception {
        enviarSimulado(medidoEm).andExpect(status().isCreated());

        Map<String, Object> janela = jdbc.queryForMap("SELECT modo, amostras, amostras_esperadas FROM janela");
        assertThat(janela.get("modo")).isEqualTo("normal");
        assertThat(janela.get("amostras")).isNull();
        assertThat(janela.get("amostras_esperadas")).isNull();
    }

    @Test
    void modoInvalidoOuAmostrasForaDaFaixaRespondem400() throws Exception {
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm, "turbo", 100, 100))
                .andExpect(status().isBadRequest());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm, "normal", -1, 100))
                .andExpect(status().isBadRequest());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm, "normal", 100, 0))
                .andExpect(status().isBadRequest());
        assertThat(contar("janela")).isZero();
    }

    @Test
    void condicoesNovasSaoAceitasEACoberturaDizOUso() throws Exception {
        long solto = abrirSimulado("sensor_solto");
        enviarSimulado(medidoEm).andExpect(status().isCreated());
        encerrar(solto);
        long desbalanceado = abrirSimulado("desbalanceamento");
        enviarSimulado(medidoEm.plusSeconds(5)).andExpect(status().isCreated());
        encerrar(desbalanceado);

        JsonNode cobertura = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/coleta/cobertura?simulado=true&rotacoes=800"), tecnico)).andExpect(status().isOk()));
        boolean viuSolto = false;
        boolean viuDesbalanceamento = false;
        for (JsonNode item : cobertura.get("itens")) {
            if (!item.get("etapa").asText().equals("T1")) {
                continue;
            }
            switch (item.get("condicao").asText()) {
                case "sensor_solto" -> {
                    assertThat(item.get("uso").asText()).isEqualTo("validacao");
                    assertThat(item.get("ensaios_validos").asLong()).isEqualTo(1);
                    viuSolto = true;
                }
                case "desbalanceamento" -> {
                    assertThat(item.get("uso").asText()).isEqualTo("treino");
                    assertThat(item.get("ensaios_validos").asLong()).isEqualTo(1);
                    viuDesbalanceamento = true;
                }
                default -> assertThat(item.get("uso").asText()).isEqualTo("treino");
            }
        }
        assertThat(viuSolto).isTrue();
        assertThat(viuDesbalanceamento).isTrue();
        // 4 etapas x 6 condições x 1 rotação
        assertThat(cobertura.get("combinacoes").asInt()).isEqualTo(24);
    }

    @Test
    void exportacaoSeparaValidacaoEMarcaJanelasForaDoTreino() throws Exception {
        long solto = abrirSimulado("sensor_solto");
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm, "normal", 8000, 8000)).andExpect(status().isCreated());
        encerrar(solto);
        long normal = abrirSimulado("normal");
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm.plusSeconds(5), "normal", 8000, 8000))
                .andExpect(status().isCreated());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm.plusSeconds(10), "rapido", 1600, 1600))
                .andExpect(status().isCreated());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, comAmostragem(medidoEm.plusSeconds(11), "normal", 7000, 8000))
                .andExpect(status().isCreated());
        encerrar(normal);

        String csv = mvc.perform(comToken(get("/api/v1/ensaios/exportar.csv?simulado=true"), tecnico))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        List<String> linhas = Arrays.asList(csv.split("\n"));
        List<String> cabecalho = Arrays.asList(linhas.get(0).split(","));
        int uso = cabecalho.indexOf("uso");
        int marca = cabecalho.indexOf("marca");
        int modo = cabecalho.indexOf("modo");
        assertThat(uso).isPositive();
        assertThat(marca).isEqualTo(uso + 1);

        // 4 janelas x 3 pontos, na ordem do ensaio e do medido_em
        assertThat(linhas).hasSize(1 + 4 * 3);
        List<String[]> campos = linhas.subList(1, linhas.size()).stream().map(l -> l.split(",", -1)).toList();
        assertThat(campos.get(0)[uso]).isEqualTo("validacao");
        assertThat(campos.get(0)[marca]).isEmpty();
        assertThat(campos.get(3)[uso]).isEqualTo("treino");
        assertThat(campos.get(3)[marca]).isEmpty();
        assertThat(campos.get(6)[modo]).isEqualTo("rapido");
        assertThat(campos.get(6)[marca]).isEqualTo("rapida");
        assertThat(campos.get(9)[marca]).isEqualTo("amostras_incompletas");
    }
}
