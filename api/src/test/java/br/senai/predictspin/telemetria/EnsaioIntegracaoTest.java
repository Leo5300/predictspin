package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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

class EnsaioIntegracaoTest extends IntegracaoBase {

    private String tecnico;
    private Instant base;

    @BeforeEach
    void preparar() throws Exception {
        tecnico = tokenDe("TECNICO");
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(1, ChronoUnit.HOURS);
    }

    private JsonNode abrir(String corpo) throws Exception {
        return corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                .contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()));
    }

    private JsonNode abrirSimulado(String etapa, String condicao, int rotacao) throws Exception {
        return abrir(json.writeValueAsString(Map.of("etapa", etapa, "condicao", condicao,
                "rotacao_alvo_rpm", rotacao, "simulado", true)));
    }

    private void encerrar(long id) throws Exception {
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/encerrar"), tecnico)).andExpect(status().isOk());
    }

    @Test
    void abreEnsaioComCodigoGeradoPelaApi() throws Exception {
        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"etapa\":\"T2\",\"condicao\":\"avanco_excessivo\",\"rotacao_alvo_rpm\":1000,"
                                + "\"material\":\"aço SAE 1045\",\"repeticao\":2,\"avanco_alvo\":0.25,"
                                + "\"observacao\":\"primeira passada\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.codigo", matchesPattern("TORNO-01-T2-\\d{5}")))
                .andExpect(jsonPath("$.aberto").value(true))
                .andExpect(jsonPath("$.condicao").value("avanco_excessivo"))
                .andExpect(jsonPath("$.material").value("aço SAE 1045"))
                .andExpect(jsonPath("$.repeticao").value(2))
                .andExpect(jsonPath("$.simulado").value(false))
                .andExpect(jsonPath("$.encerrado_em", nullValue()));
    }

    @Test
    void pedidoInvalidoResponde400() throws Exception {
        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"etapa\":\"T9\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":800}"))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"etapa\":\"T1\",\"condicao\":\"quebrada\",\"rotacao_alvo_rpm\":800}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("normal")));
        mvc.perform(comToken(post("/api/v1/maquinas/999999/ensaios"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":800}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void segundoEnsaioAbertoNaMesmaMaquinaResponde409() throws Exception {
        abrirSimulado("T1", "normal", 800);
        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":1200}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void janelaRecebidaComEnsaioAbertoEhAssociadaAoEnsaio() throws Exception {
        long ensaioId = abrirSimulado("T1", "ferramenta_desgastada", 1200).get("id").asLong();

        enviarSimulado(base).andExpect(status().isCreated()).andExpect(jsonPath("$.ensaio_id").value(ensaioId));
        enviarSimulado(base.plusSeconds(5)).andExpect(jsonPath("$.ensaio_id").value(ensaioId));
        // dispositivo real não entra em ensaio simulado
        enviarReal(base).andExpect(status().isCreated()).andExpect(jsonPath("$.ensaio_id", nullValue()));

        encerrar(ensaioId);
        enviarSimulado(base.plusSeconds(10)).andExpect(jsonPath("$.ensaio_id", nullValue()));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM janela WHERE ensaio_id = ?", Long.class, ensaioId))
                .isEqualTo(2);
    }

    @Test
    void janelaDeDispositivoRealEntraEmEnsaioReal() throws Exception {
        long ensaioId = abrir("{\"etapa\":\"T3\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":800}").get("id").asLong();
        enviarReal(base).andExpect(jsonPath("$.ensaio_id").value(ensaioId));
        enviarSimulado(base).andExpect(jsonPath("$.ensaio_id", nullValue()));
    }

    @Test
    void ensaioHerdaSimuladoQuandoMaquinaSoTemDispositivoSimuladoAtivo() throws Exception {
        jdbc.update("UPDATE dispositivo SET ativo = false WHERE identificador = ?", DISPOSITIVO_REAL);
        abrir("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":800,\"simulado\":false}");
        assertThat(jdbc.queryForObject("SELECT simulado FROM ensaio", Boolean.class)).isTrue();
    }

    @Test
    void encerrarDuasVezesResponde409() throws Exception {
        long id = abrirSimulado("T1", "normal", 800).get("id").asLong();
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/encerrar"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aberto").value(false))
                .andExpect(jsonPath("$.encerrado_em").isNotEmpty());
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/encerrar"), tecnico)).andExpect(status().isConflict());
        mvc.perform(comToken(post("/api/v1/ensaios/999999/encerrar"), tecnico)).andExpect(status().isNotFound());
        // depois de encerrar, a máquina aceita novo ensaio
        abrirSimulado("T1", "normal", 1200);
    }

    @Test
    void descartarMarcaEncerraENaoApaga() throws Exception {
        long id = abrirSimulado("T2", "normal", 800).get("id").asLong();
        enviarSimulado(base).andExpect(status().isCreated());

        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/descartar"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.descartado").value(true))
                .andExpect(jsonPath("$.aberto").value(false));
        mvc.perform(comToken(post("/api/v1/ensaios/" + id + "/descartar"), tecnico)).andExpect(status().isConflict());

        assertThat(contar("ensaio")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM janela WHERE ensaio_id = ?", Long.class, id)).isEqualTo(1);
        mvc.perform(comToken(get("/api/v1/ensaios/" + id), tecnico)).andExpect(jsonPath("$.descartado").value(true));
    }

    @Test
    void resumoTrazDuracaoJanelasSaturadasERotacaoMedia() throws Exception {
        long id = abrirSimulado("T1", "normal", 1200).get("id").asLong();
        var p1 = payload(DISPOSITIVO_SIM, base);
        p1.put("rotacao_rpm", 1190.0);
        var p2 = payload(DISPOSITIVO_SIM, base.plusSeconds(5));
        p2.put("rotacao_rpm", 1210.0);
        p2.put("saturou", true);
        var p3 = payload(DISPOSITIVO_SIM, base.plusSeconds(10));
        p3.put("rotacao_rpm", 1200.0);
        for (var p : List.of(p1, p2, p3)) {
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
        }
        encerrar(id);

        mvc.perform(comToken(get("/api/v1/ensaios/" + id + "/resumo"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.janelas").value(3))
                .andExpect(jsonPath("$.janelas_saturadas").value(1))
                .andExpect(jsonPath("$.rotacao_media_rpm").value(1200.0))
                .andExpect(jsonPath("$.duracao_segundos").isNumber())
                .andExpect(jsonPath("$.primeira_medicao").value(base.toString()))
                .andExpect(jsonPath("$.aberto").value(false));
    }

    @Test
    void resumoDeEnsaioSemJanela() throws Exception {
        long id = abrirSimulado("T0", "normal", 0).get("id").asLong();
        mvc.perform(comToken(get("/api/v1/ensaios/" + id + "/resumo"), tecnico))
                .andExpect(jsonPath("$.janelas").value(0))
                .andExpect(jsonPath("$.rotacao_media_rpm", nullValue()));
    }

    @Test
    void coberturaContaSoEnsaiosValidosPorEtapaCondicaoERotacao() throws Exception {
        // válido: encerrado, com janela
        long valido = abrirSimulado("T1", "normal", 800).get("id").asLong();
        enviarSimulado(base).andExpect(status().isCreated());
        encerrar(valido);
        // sem janela: não conta
        encerrar(abrirSimulado("T1", "normal", 800).get("id").asLong());
        // descartado: não conta
        long descartado = abrirSimulado("T1", "normal", 800).get("id").asLong();
        enviarSimulado(base.plusSeconds(5)).andExpect(status().isCreated());
        mvc.perform(comToken(post("/api/v1/ensaios/" + descartado + "/descartar"), tecnico)).andExpect(status().isOk());
        // aberto: não conta
        abrirSimulado("T2", "ferramenta_desgastada", 1200);
        enviarSimulado(base.plusSeconds(10)).andExpect(status().isCreated());

        JsonNode cobertura = corpo(mvc.perform(comToken(
                        get("/api/v1/maquinas/" + maquinaId + "/coleta/cobertura?meta=2&simulado=true"), tecnico))
                .andExpect(status().isOk()));

        assertThat(cobertura.get("rotacoes_rpm").toString()).isEqualTo("[800,1200]");
        assertThat(cobertura.get("combinacoes").asInt()).isEqualTo(4 * 6 * 2); // etapas x condições (6 desde a V3) x rotações
        assertThat(cobertura.get("ensaios_validos").asInt()).isEqualTo(1);
        assertThat(cobertura.get("ensaios_faltantes").asInt()).isEqualTo(4 * 6 * 2 * 2 - 1);
        JsonNode t1Normal800 = null;
        for (JsonNode item : cobertura.get("itens")) {
            if (item.get("etapa").asText().equals("T1") && item.get("condicao").asText().equals("normal")
                    && item.get("rotacao_alvo_rpm").asInt() == 800) {
                t1Normal800 = item;
            }
        }
        assertThat(t1Normal800).isNotNull();
        assertThat(t1Normal800.get("ensaios_validos").asInt()).isEqualTo(1);
        assertThat(t1Normal800.get("faltam").asInt()).isEqualTo(1);

        // grade informada explicitamente e filtro de dado real
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/coleta/cobertura?rotacoes=500,1500&simulado=false"),
                        tecnico))
                .andExpect(jsonPath("$.rotacoes_rpm.length()").value(2))
                .andExpect(jsonPath("$.ensaios_validos").value(0))
                .andExpect(jsonPath("$.meta").value(3));
    }

    @Test
    void exportacaoCsvTrazUmaLinhaPorJanelaEPontoComRotulos() throws Exception {
        long id = abrir("{\"etapa\":\"T1\",\"condicao\":\"ferramenta_desgastada\",\"rotacao_alvo_rpm\":1200,"
                + "\"material\":\"aço, barra\",\"simulado\":true}").get("id").asLong();
        enviarSimulado(base).andExpect(status().isCreated());
        var semCanais = payload(DISPOSITIVO_SIM, base.plusSeconds(5));
        semCanais.remove("canais");
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, semCanais).andExpect(status().isCreated());
        encerrar(id);
        // ensaio descartado fica de fora
        long descartado = abrirSimulado("T2", "normal", 800).get("id").asLong();
        enviarSimulado(base.plusSeconds(10)).andExpect(status().isCreated());
        mvc.perform(comToken(post("/api/v1/ensaios/" + descartado + "/descartar"), tecnico)).andExpect(status().isOk());

        var resposta = mvc.perform(comToken(get("/api/v1/ensaios/exportar.csv?simulado=true"), tecnico))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.startsWith("text/csv")))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
                .andReturn().getResponse();
        String[] linhas = resposta.getContentAsString(java.nio.charset.StandardCharsets.UTF_8).split("\n");

        assertThat(linhas).hasSize(1 + 2 * 3);
        assertThat(linhas[0]).startsWith("ensaio,etapa,condicao,material,rotacao_alvo_rpm")
                .endsWith("amb_temp_c,amb_umid_pct,corrente_a,temp_cabecote_c,temp_ferramenta_c");
        assertThat(linhas[1]).contains(",T1,ferramenta_desgastada,\"aço, barra\",1200,")
                .contains(",true,TORNO-01,ps-sim-01,")
                .contains(",A,acionamento,0.1,")
                .endsWith(",24.0,55.0,4.2,31.5,35.0");
        assertThat(linhas[6]).contains(",C,estrutura,").endsWith(",,,,,");

        String reais = mvc.perform(comToken(get("/api/v1/ensaios/exportar.csv?simulado=false"), tecnico))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(reais.split("\n")).hasSize(1);
    }

    @Test
    void listagemDeEnsaiosEhPaginadaEFiltrada() throws Exception {
        for (int i = 0; i < 5; i++) {
            long id = abrirSimulado(i % 2 == 0 ? "T1" : "T2", "normal", 800 + i).get("id").asLong();
            encerrar(id);
        }
        abrirSimulado("T3", "rotacao_inadequada", 900);

        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?page=0&size=2"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conteudo.length()").value(2))
                .andExpect(jsonPath("$.total_elementos").value(6))
                .andExpect(jsonPath("$.total_paginas").value(3))
                .andExpect(jsonPath("$.conteudo[0].etapa").value("T3"));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?page=2&size=2"), tecnico))
                .andExpect(jsonPath("$.conteudo.length()").value(2));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?etapa=T1"), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(3));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?aberto=true"), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(1))
                .andExpect(jsonPath("$.conteudo[0].condicao").value("rotacao_inadequada"));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?condicao=rotacao_inadequada&aberto=false"),
                        tecnico))
                .andExpect(jsonPath("$.total_elementos").value(0));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?simulado=false"), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(0));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios?size=500"), tecnico))
                .andExpect(status().isBadRequest());
    }
}
