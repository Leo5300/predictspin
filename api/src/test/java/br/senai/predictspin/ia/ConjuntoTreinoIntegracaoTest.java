package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

/**
 * Conjunto de treino: só janelas rotuladas (ensaio encerrado das 5 classes em T1 e T3; retorno da OS), com o
 * vetor calculado na API e o motivo de quem não tem vetor; rotas só com a chave do serviço de treino.
 */
class ConjuntoTreinoIntegracaoTest extends AlarmeIntegracaoBase {

    static final String CHAVE_TREINO = "chave-treino-teste";

    private JsonNode resumo(String chave) throws Exception {
        var req = get("/api/v1/treino/servico/conjunto/resumo?simulado=true&maquina_id=" + maquinaId);
        if (chave != null) {
            req.header("X-Treino-Chave", chave);
        }
        return corpo(mvc.perform(req));
    }

    private JsonNode pagina(int pagina, int tamanho) throws Exception {
        return corpo(mvc.perform(get("/api/v1/treino/servico/conjunto?simulado=true&maquina_id=" + maquinaId
                + "&pagina=" + pagina + "&tamanho=" + tamanho).header("X-Treino-Chave", CHAVE_TREINO))
                .andExpect(status().isOk()));
    }

    /** Todas as linhas, página por página. */
    private List<JsonNode> todas() throws Exception {
        List<JsonNode> linhas = new java.util.ArrayList<>();
        int p = 0;
        JsonNode pg;
        do {
            pg = pagina(p++, 40);
            pg.get("conteudo").forEach(linhas::add);
        } while (p < pg.get("total_paginas").asInt());
        return linhas;
    }

    private static Map<String, Integer> contarPor(List<JsonNode> linhas, String campo, boolean soComVetor) {
        Map<String, Integer> n = new HashMap<>();
        for (JsonNode l : linhas) {
            if (!soComVetor || !l.get("valores").isNull()) {
                n.merge(l.get(campo).asText(), 1, Integer::sum);
            }
        }
        return n;
    }

    @Test
    void soComAChaveDoServicoDeTreino() throws Exception {
        mvc.perform(get("/api/v1/treino/servico/conjunto/resumo?maquina_id=" + maquinaId))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/treino/servico/conjunto/resumo?maquina_id=" + maquinaId)
                .header("X-Treino-Chave", "errada")).andExpect(status().isUnauthorized());
        // o token de usuário não serve nesta cadeia
        mvc.perform(comToken(get("/api/v1/treino/servico/conjunto/resumo?maquina_id=" + maquinaId), tokenAdmin()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/treino/servico/conjunto/resumo?maquina_id=999999")
                .header("X-Treino-Chave", CHAVE_TREINO)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/treino/servico/conjunto?maquina_id=" + maquinaId + "&tamanho=100000")
                .header("X-Treino-Chave", CHAVE_TREINO)).andExpect(status().isBadRequest());
    }

    @Test
    void ensaiosRotuladosEntramComOVetorEOsOutrosNao() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = Instant.now().minus(java.time.Duration.ofHours(1)).truncatedTo(ChronoUnit.SECONDS);
        // avanço excessivo no corte: entra com o rótulo da condição
        t = gravarEnsaio(token, "T3", "avanco_excessivo", 1120, null, 6, t, CORTE[0], CORTE[1] * 2, CORTE[2]);
        // sensor solto é validação, nunca classe; T0 e T2 não entram
        t = gravarEnsaio(token, "T3", "sensor_solto", 1120, null, 3, t, CORTE[0], 0.01, CORTE[2]);
        t = gravarEnsaio(token, "T2", "normal", 1120, null, 3, t, VAZIO[0], VAZIO[1], VAZIO[2]);
        // descartado não entra
        long descartado = abrirEnsaio(token, "T3", "normal", 1120, null);
        enviarSequencia(t, 2, 1120, CORTE);
        t = t.plusSeconds(10);
        mvc.perform(comToken(post("/api/v1/ensaios/" + descartado + "/descartar"), token)).andExpect(status().isOk());
        // evento marcado (ensaio ao vivo: o evento tem de ser depois da abertura): a janela que o contém e a
        // seguinte ficam fora
        long comEvento = abrirEnsaio(token, "T3", "normal", 1120, null);
        Instant inicioEvento = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        enviarSequencia(inicioEvento, 4, 1120, CORTE);
        mvc.perform(comToken(post("/api/v1/ensaios/" + comEvento + "/eventos"), token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("motivo", "pancada",
                        "ocorrido_em", inicioEvento.plusSeconds(6).toString())))).andExpect(status().isCreated());
        encerrarEnsaio(token, comEvento);

        JsonNode r = resumo(CHAVE_TREINO);
        assertThat(r.get("versao_vetor").asText()).isEqualTo("v1");
        assertThat(r.get("caracteristicas")).hasSize(25);
        assertThat(r.get("canais")).isEmpty();
        assertThat(r.get("referencia_numero").asInt()).isEqualTo(1);
        assertThat(r.get("modelo").get("if_percentil").asDouble()).isEqualTo(99);
        assertThat(r.get("treino").get("min_ensaios_por_classe").asInt()).isEqualTo(2);
        assertThat(r.get("treino").toString()).doesNotContain(CHAVE_TREINO);
        // T1 e T3 normais da referência (25 + 25) + 6 de avanço + 4 com evento
        assertThat(r.get("total_candidatas").asLong()).isEqualTo(60);

        List<JsonNode> linhas = todas();
        assertThat(linhas).hasSize(60);
        assertThat(contarPor(linhas, "rotulo", false)).containsOnly(Map.entry("normal", 54),
                Map.entry("avanco_excessivo", 6));
        assertThat(contarPor(linhas, "origem", false)).containsOnly(Map.entry("ensaio", 60));
        // a janela do evento (2ª, de 5 a 10 s) e a seguinte (3ª) ficam sem vetor
        assertThat(linhas.stream().filter(l -> "evento_marcado".equals(l.get("motivo_exclusao").asText(null))))
                .hasSize(2);
        JsonNode avanco = linhas.stream().filter(l -> l.get("rotulo").asText().equals("avanco_excessivo"))
                .findFirst().orElseThrow();
        assertThat(avanco.get("valores")).hasSize(25);
        assertThat(avanco.get("grupo").asText()).startsWith("ensaio-");
        assertThat(avanco.get("ensaio_id").isNull()).isFalse();
        assertThat(avanco.get("dia").asText()).matches("\\d{4}-\\d{2}-\\d{2}");
        // B com o dobro do RMS do corte normal: z do RMS do B bem acima de 3
        int zB = indice(r, "z_B_rms_g");
        assertThat(avanco.get("valores").get(zB).asDouble()).isGreaterThan(3);
        assertThat(avanco.get("valores").get(indice(r, "etapa_t3")).asDouble()).isEqualTo(1);
    }

    private static int indice(JsonNode resumo, String nome) {
        for (int i = 0; i < resumo.get("caracteristicas").size(); i++) {
            if (resumo.get("caracteristicas").get(i).asText().equals(nome)) {
                return i;
            }
        }
        throw new AssertionError(nome);
    }

    /** Episódio severo nos três pontos, depois volta ao corte normal; devolve o instante seguinte. */
    private Instant episodio(Instant t) throws Exception {
        t = enviarSequencia(t, 5, 1120, SEVERO);
        return enviarSequencia(t, 6, 1120, CORTE);
    }

    private List<Long> osAbertas(String token) throws Exception {
        List<Long> ids = new java.util.ArrayList<>();
        corpo(mvc.perform(comToken(get("/api/v1/ordens-servico?simulado=true&status=aberta"), token)))
                .get("conteudo").forEach(os -> ids.add(os.get("id").asLong()));
        return ids;
    }

    @Test
    void retornoDaOsViraRotuloComAOrigem() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        // 1º episódio: uma OS confirmada com avanço excessivo, as outras do mesmo episódio com "outra"
        Instant t = episodio(Instant.now().truncatedTo(ChronoUnit.SECONDS));
        List<Long> primeiro = osAbertas(token);
        assertThat(primeiro).isNotEmpty();
        concluir(token, primeiro.get(0), "confirmada", "avanco_excessivo", 200);
        for (long outra : primeiro.subList(1, primeiro.size())) {
            concluir(token, outra, "confirmada", "outra", 200);
        }
        assertThat(corpo(mvc.perform(comToken(get("/api/v1/ordens-servico/" + primeiro.get(0)), token)))
                .get("condicao_encontrada").asText()).isEqualTo("avanco_excessivo");
        // 2º episódio: todas rejeitadas (falso positivo)
        episodio(t);
        List<Long> segundo = osAbertas(token);
        assertThat(segundo).isNotEmpty();
        for (long id : segundo) {
            concluir(token, id, "rejeitada", null, 200);
        }

        List<JsonNode> linhas = todas();
        assertThat(contarPor(linhas, "origem", false)).containsKeys("ensaio", "os_confirmada", "os_rejeitada");
        for (JsonNode l : linhas) {
            switch (l.get("origem").asText()) {
                case "os_confirmada" -> {
                    assertThat(l.get("rotulo").asText()).isEqualTo("avanco_excessivo");
                    assertThat(l.get("grupo").asText()).isEqualTo("os-" + primeiro.get(0));
                    assertThat(l.get("ensaio_id").isNull()).isTrue();
                }
                case "os_rejeitada" -> {
                    assertThat(l.get("rotulo").asText()).isEqualTo("normal");
                    assertThat(segundo).contains(Long.valueOf(l.get("grupo").asText().substring(3)));
                }
                default -> assertThat(l.get("origem").asText()).isEqualTo("ensaio");
            }
        }
        // cada janela aparece uma vez, mesmo no período de duas OS
        assertThat(linhas.stream().map(l -> l.get("janela_id").asLong()).distinct().count())
                .isEqualTo(linhas.size());
        assertThat(resumo(CHAVE_TREINO).get("total_candidatas").asLong()).isEqualTo(linhas.size());
    }

    private void concluir(String token, long id, String retorno, String condicao, int esperado) throws Exception {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("retorno", retorno);
        if (condicao != null) {
            corpo.put("condicao_encontrada", condicao);
        }
        mvc.perform(comToken(post("/api/v1/ordens-servico/" + id + "/concluir"), token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(corpo)))
                .andExpect(status().is(esperado));
    }

    @Test
    void condicaoEncontradaInvalidaEhRecusada() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 5, 1120, SEVERO);
        long id = corpo(mvc.perform(comToken(get("/api/v1/ordens-servico?simulado=true"), token)))
                .get("conteudo").get(0).get("id").asLong();
        concluir(token, id, "confirmada", "sensor_solto", 400);
    }
}
