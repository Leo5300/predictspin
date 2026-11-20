package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.IntegracaoBase;

class ReceitaIntegracaoTest extends IntegracaoBase {

    private String tecnico;

    @BeforeEach
    void preparar() throws Exception {
        tecnico = tokenDe("TECNICO");
    }

    private JsonNode abrir(String corpo) throws Exception {
        return corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                .contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()));
    }

    private long criar(String rota, String nome) throws Exception {
        return corpo(mvc.perform(comToken(post(rota), tecnico).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"" + nome + "\"}")).andExpect(status().isCreated())).get("id").asLong();
    }

    @Test
    void abreComAReceitaDoCatalogoEDevolveIdENome() throws Exception {
        long aco = criar("/api/v1/materiais", "Aço SAE 1045");
        long bit = criar("/api/v1/ferramentas", "Bit de metal duro");
        JsonNode ensaio = abrir("{\"etapa\":\"T3\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":450,"
                + "\"material_id\":" + aco + ",\"ferramenta_id\":" + bit + ",\"avanco_alvo\":0.1,"
                + "\"profundidade_corte_mm\":1.5,\"diametro_peca_mm\":38,\"fluido_corte\":\"emulsao\","
                + "\"simulado\":true}");
        assertThat(ensaio.get("material").asText()).isEqualTo("Aço SAE 1045");
        assertThat(ensaio.at("/material_item/id").asLong()).isEqualTo(aco);
        assertThat(ensaio.at("/ferramenta_item/nome").asText()).isEqualTo("Bit de metal duro");
        assertThat(ensaio.get("profundidade_corte_mm").decimalValue()).isEqualByComparingTo("1.5");
        assertThat(ensaio.get("diametro_peca_mm").decimalValue()).isEqualByComparingTo("38");
        assertThat(ensaio.get("fluido_corte").asText()).isEqualTo("emulsao");

        // filtro da listagem por material e por ferramenta
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?material_id=" + aco), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(1));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?ferramenta_id=999999"), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(0));
    }

    @Test
    void textoDeMaterialSemIdUsaOuCriaOItemDoCatalogo() throws Exception {
        long aco = criar("/api/v1/materiais", "Aço SAE 1045");
        JsonNode primeiro = abrir("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":450,"
                + "\"material\":\"aco sae-1045\",\"simulado\":true}");
        assertThat(primeiro.at("/material_item/id").asLong()).isEqualTo(aco);
        assertThat(primeiro.get("material").asText()).isEqualTo("Aço SAE 1045");
        mvc.perform(comToken(post("/api/v1/ensaios/" + primeiro.get("id").asLong() + "/encerrar"), tecnico))
                .andExpect(status().isOk());

        JsonNode segundo = abrir("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":450,"
                + "\"material\":\"Latão\",\"simulado\":true}");
        assertThat(segundo.at("/material_item/nome").asText()).isEqualTo("Latão");
        assertThat(contar("material")).isEqualTo(2);
    }

    @Test
    void corrigeAReceitaComHistoricoECampoProibidoEhRecusado() throws Exception {
        long aco = criar("/api/v1/materiais", "Aço SAE 1045");
        long id = abrir("{\"etapa\":\"T3\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":450,"
                + "\"avanco_alvo\":0.15,\"simulado\":true}").get("id").asLong();

        mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"material_id\":" + aco + ",\"avanco_alvo\":0.1,\"fluido_corte\":\"seco\","
                                + "\"observacao\":\"peça presa com folga\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.material_item.id").value(aco))
                .andExpect(jsonPath("$.avanco_alvo").value(0.1))
                .andExpect(jsonPath("$.fluido_corte").value("seco"))
                .andExpect(jsonPath("$.etapa").value("T3"));
        // mesmo valor de novo não gera histórico; null apaga
        mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"avanco_alvo\":0.100,\"fluido_corte\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fluido_corte").doesNotExist());

        // etapa, condição, rotação, simulado e período não mudam
        for (String proibido : List.of("{\"etapa\":\"T1\"}", "{\"condicao\":\"avanco_excessivo\"}",
                "{\"rotacao_alvo_rpm\":900}", "{\"simulado\":false}", "{\"iniciado_em\":\"2026-01-01T00:00:00Z\"}",
                "{\"avanco_alvo\":0.2,\"etapa\":\"T0\"}")) {
            mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), tecnico)
                            .contentType(MediaType.APPLICATION_JSON).content(proibido))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.mensagem", containsString("Não mudam")));
        }
        mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"profundidade_corte_mm\":50}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("profundidade_corte_mm"));
        mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"fluido_corte\":\"agua\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());

        JsonNode historico = corpo(mvc.perform(comToken(get("/api/v1/ensaios/" + id + "/alteracoes"), tecnico))
                .andExpect(status().isOk()));
        assertThat(historico.get("total_elementos").asInt()).isEqualTo(5);
        JsonNode material = historico.get("conteudo").get(0);
        assertThat(material.get("campo").asText()).isEqualTo("material");
        assertThat(material.get("valor_antigo").isNull()).isTrue();
        assertThat(material.get("valor_novo").asText()).isEqualTo("Aço SAE 1045");
        assertThat(material.get("alterado_por_nome").asText()).isEqualTo("Usuário TECNICO");
        assertThat(historico.get("conteudo").get(1).get("valor_antigo").asText()).isEqualTo("0.15");
        assertThat(historico.get("conteudo").get(1).get("valor_novo").asText()).isEqualTo("0.1");
        assertThat(historico.get("conteudo").get(4).get("campo").asText()).isEqualTo("fluido_corte");
        assertThat(historico.get("conteudo").get(4).get("valor_novo").isNull()).isTrue();
    }

    @Test
    void eventoSoComEnsaioAbertoEMarcaAsJanelasNoCsv() throws Exception {
        Instant base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(10, ChronoUnit.MINUTES);
        long id = abrir("{\"etapa\":\"T3\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":1200,"
                + "\"simulado\":true}").get("id").asLong();
        // o ensaio começa "agora": as janelas usam instantes depois do início
        Instant inicio = Instant.parse(corpo(mvc.perform(comToken(get("/api/v1/ensaios/" + id), tecnico)))
                .get("iniciado_em").asText()).truncatedTo(ChronoUnit.SECONDS).plusSeconds(1);
        for (int i = 0; i < 5; i++) {
            enviarSimulado(inicio.plusSeconds(5L * i)).andExpect(status().isCreated());
        }
        // evento no meio da janela 2 (de inicio+10 s a inicio+15 s): marca as janelas 2 e 3
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/eventos"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ocorrido_em\":\"" + inicio.plusSeconds(12) + "\",\"motivo\":\"pancada\","
                                + "\"nota\":\"martelo na bancada\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.motivo").value("pancada"))
                .andExpect(jsonPath("$.ensaio_codigo").exists());
        // instante antes do início do ensaio ou no futuro: 400
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/eventos"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ocorrido_em\":\"" + base + "\",\"motivo\":\"cavaco\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/eventos"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ocorrido_em\":\"" + Instant.now().plus(1, ChronoUnit.HOURS)
                                + "\",\"motivo\":\"cavaco\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/eventos"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"vento\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/encerrar"), tecnico)).andExpect(status().isOk());
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/eventos"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"outro\"}"))
                .andExpect(status().isConflict());
        mvc.perform(comToken(get("/api/v1/ensaios/" + id + "/eventos"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(1))
                .andExpect(jsonPath("$.conteudo[0].nota").value("martelo na bancada"));

        String csv = mvc.perform(comToken(get("/api/v1/ensaios/exportar.csv?simulado=true"), tecnico))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        List<String> linhas = Arrays.asList(csv.split("\n"));
        List<String> cabecalho = Arrays.asList(linhas.get(0).split(","));
        // as colunas da V5 continuam juntas; as da V6 vêm depois delas e, no fim, o canal criado pela V9
        assertThat(cabecalho.get(cabecalho.size() - 1)).isEqualTo("nivel_som_db");
        assertThat(cabecalho.subList(cabecalho.size() - 10, cabecalho.size() - 5)).containsExactly("ferramenta",
                "profundidade_corte_mm", "diametro_peca_mm", "fluido_corte", "evento_marcado");
        int medido = cabecalho.indexOf("medido_em");
        int evento = cabecalho.indexOf("evento_marcado");
        // uma linha por janela e ponto (3 pontos): só as janelas que contêm o evento e a seguinte
        List<String> marcadas = linhas.subList(1, linhas.size()).stream()
                .map(l -> l.split(",", -1)).filter(c -> c[evento].equals("true")).map(c -> c[medido]).distinct()
                .toList();
        assertThat(marcadas).containsExactly(inicio.plusSeconds(10).toString(), inicio.plusSeconds(15).toString());
    }

    @Test
    void operadorNaoCorrigeReceitaNemMarcaEvento() throws Exception {
        long id = abrir("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":450}").get("id").asLong();
        String operador = tokenDe("OPERADOR");
        mvc.perform(comToken(patch("/api/v1/ensaios/" + id + "/receita"), operador)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"observacao\":\"x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/eventos"), operador)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"outro\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(get("/api/v1/ensaios/999999/alteracoes"), tecnico)).andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/ensaios/999999/eventos"), tecnico)).andExpect(status().isNotFound());
    }
}
