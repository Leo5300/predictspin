package br.senai.predictspin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Contrato: o JSON que a API devolve tem de ter exatamente as chaves que o documento OpenAPI
 * (/v3/api-docs) declara para a mesma rota e o mesmo status. O painel gera o cliente a partir desse
 * documento; se um lado mudar sem o outro, este teste quebra.
 */
class ContratoOpenApiIntegracaoTest extends AlarmeIntegracaoBase {

    private JsonNode documento;
    private String admin;
    private final Instant base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(5, ChronoUnit.MINUTES);

    @BeforeEach
    void carregarDocumento() throws Exception {
        documento = corpo(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()));
        admin = tokenAdmin();
    }

    // ------------------------------------------------------------------ forma do documento

    @Test
    void esquemasUsamSnakeCaseEValoresSerializadosDosEnums() {
        JsonNode esquemas = documento.at("/components/schemas");
        List<String> comMaiuscula = new ArrayList<>();
        esquemas.fields().forEachRemaining(esquema -> {
            JsonNode propriedades = esquema.getValue().get("properties");
            if (propriedades != null) {
                propriedades.fieldNames().forEachRemaining(nome -> {
                    if (!nome.equals(nome.toLowerCase())) {
                        comMaiuscula.add(esquema.getKey() + "." + nome);
                    }
                });
            }
        });
        assertThat(comMaiuscula).as("propriedades fora de snake_case").isEmpty();

        assertThat(valores(esquemas.at("/UltimaJanelaResposta/properties/modo/enum")))
                .containsExactly("normal", "rapido");
        assertThat(valores(esquemas.at("/EnsaioResposta/properties/condicao/enum")))
                .contains("ferramenta_desgastada", "sensor_solto");
        assertThat(valores(esquemas.at("/CoberturaItem/properties/uso/enum"))).containsExactly("treino", "validacao");
        assertThat(valores(esquemas.at("/PontoResposta/properties/papel/enum")))
                .containsExactly("acionamento", "ferramenta", "estrutura");
        assertThat(valores(esquemas.at("/MaquinaResposta/properties/classe/enum"))).contains("torno");
    }

    @Test
    void respostasDizemOQueSempreVemEOQuePodeSerNulo() {
        JsonNode esquemas = documento.at("/components/schemas");
        // toda propriedade de resposta é obrigatória, menos as que a API omite
        assertThat(valores(esquemas.at("/JanelaResposta/required"))).contains("id", "medido_em", "ensaio_id", "pontos");
        assertThat(valores(esquemas.at("/PaginaMaquinaResposta/required")))
                .containsExactlyInAnyOrder("conteudo", "pagina", "tamanho", "total_elementos", "total_paginas");
        assertThat(valores(esquemas.at("/ErroResposta/required")))
                .containsExactlyInAnyOrder("timestamp", "status", "erro", "mensagem", "caminho");
        assertThat(valores(esquemas.at("/IngestaoResposta/required"))).doesNotContain("modo_rapido_ate");
        // nulo só onde o dado pode faltar
        assertThat(valores(esquemas.at("/JanelaResposta/properties/ensaio_id/type"))).contains("null");
        assertThat(valores(esquemas.at("/JanelaResposta/properties/amostras/type"))).contains("null");
        assertThat(esquemas.at("/JanelaResposta/properties/medido_em/type").asText()).isEqualTo("string");
        assertThat(valores(esquemas.at("/ModoRapidoResposta/properties/modo_rapido_ate/type"))).contains("null");
        assertThat(valores(esquemas.at("/SerieIntervalo/properties/rotacao_media_rpm/type"))).contains("null");
        assertThat(esquemas.at("/JanelaPonto/properties/rms_g/type").asText()).isEqualTo("number");
        // a marca interna não vaza para o documento
        assertThat(documento.toString()).doesNotContain("x-opcional").doesNotContain("x-nulo");
        // requisições seguem a validação
        assertThat(valores(esquemas.at("/LoginRequisicao/required"))).containsExactlyInAnyOrder("email", "senha");
    }

    @Test
    void respostasSaoJsonTipadoEOCsvETextoCsv() {
        JsonNode maquinas = documento.at("/paths/~1api~1v1~1maquinas/get/responses/200/content");
        assertThat(maquinas.has("application/json")).isTrue();
        assertThat(maquinas.at("/application~1json/schema/$ref").asText())
                .isEqualTo("#/components/schemas/PaginaMaquinaResposta");
        assertThat(documento.at("/components/schemas/PaginaMaquinaResposta/properties/conteudo/items/$ref").asText())
                .isEqualTo("#/components/schemas/MaquinaResposta");

        JsonNode csv = documento.at("/paths/~1api~1v1~1ensaios~1exportar.csv/get/responses/200/content");
        assertThat(csv.fieldNames()).toIterable().containsExactly("text/csv");
        assertThat(csv.at("/text~1csv/schema/type").asText()).isEqualTo("string");
    }

    @Test
    void parametrosDeConsultaTemONomeReal() {
        assertThat(nomesDosParametros("/api/v1/ensaios/exportar.csv", "get")).containsExactlyInAnyOrder(
                "simulado", "maquina_id");
        assertThat(nomesDosParametros("/api/v1/pontos/{id}/telemetria", "get")).containsExactlyInAnyOrder(
                "id", "de", "ate", "simulado", "page", "size");
        assertThat(nomesDosParametros("/api/v1/maquinas/{id}/coleta/cobertura", "get")).containsExactlyInAnyOrder(
                "id", "simulado", "meta", "rotacoes");
        assertThat(nomesDosParametros("/api/v1/maquinas/{id}/janelas", "get")).containsExactlyInAnyOrder(
                "id", "de", "ate", "simulado", "modo", "ordem", "page", "size");
        assertThat(nomesDosParametros("/api/v1/maquinas/{id}/serie", "get")).containsExactlyInAnyOrder(
                "id", "de", "ate", "simulado", "baldes");
        assertThat(nomesDosParametros("/api/v1/maquinas/{id}/eventos", "get")).containsExactlyInAnyOrder(
                "id", "simulado");
        JsonNode ordem = documento.at("/paths/~1api~1v1~1maquinas~1{id}~1janelas/get/parameters");
        ordem.forEach(parametro -> {
            if (parametro.get("name").asText().equals("ordem")) {
                assertThat(valores(parametro.at("/schema/enum"))).containsExactly("asc", "desc");
            }
            if (parametro.get("name").asText().equals("modo")) {
                assertThat(valores(parametro.at("/schema/enum"))).containsExactly("normal", "rapido");
            }
        });
    }

    @Test
    void todaOperacaoDeclaraUmaRespostaDeSucesso() {
        List<String> semSucesso = new ArrayList<>();
        documento.get("paths").fields().forEachRemaining(caminho -> caminho.getValue().fields()
                .forEachRemaining(operacao -> {
                    boolean temSucesso = false;
                    Iterator<String> codigos = operacao.getValue().get("responses").fieldNames();
                    while (codigos.hasNext()) {
                        temSucesso |= codigos.next().startsWith("2");
                    }
                    if (!temSucesso) {
                        semSucesso.add(operacao.getKey() + " " + caminho.getKey());
                    }
                }));
        assertThat(semSucesso).as("operações sem resposta 2xx no documento").isEmpty();
    }

    @Test
    void todaRespostaDeErroDasRotasDaApiApontaParaErroResposta() {
        List<String> semErroResposta = new ArrayList<>();
        documento.get("paths").fields().forEachRemaining(caminho -> {
            if (!caminho.getKey().startsWith("/api/v1")) {
                return;
            }
            caminho.getValue().fields().forEachRemaining(operacao -> {
                JsonNode respostas = operacao.getValue().get("responses");
                assertThat(respostas.has("401")).as("401 em %s %s", operacao.getKey(), caminho.getKey()).isTrue();
                respostas.fields().forEachRemaining(resposta -> {
                    String codigo = resposta.getKey();
                    if (codigo.startsWith("4") || codigo.startsWith("5")) {
                        String ref = resposta.getValue().at("/content/application~1json/schema/$ref").asText();
                        if (!"#/components/schemas/ErroResposta".equals(ref)) {
                            semErroResposta.add(operacao.getKey() + " " + caminho.getKey() + " " + codigo);
                        }
                    }
                });
            });
        });
        assertThat(semErroResposta).isEmpty();
    }

    // ------------------------------------------------------------------ JSON real contra o documento

    @Test
    void loginEUsuarioDoToken() throws Exception {
        conferir("/api/v1/auth/login", "post", 200, login(ADMIN_EMAIL, ADMIN_SENHA, ipNovo()));
        conferir("/api/v1/auth/eu", "get", 200, mvc.perform(comToken(get("/api/v1/auth/eu"), admin)));
    }

    @Test
    void maquinasPontosEDispositivos() throws Exception {
        enviarSimulado(base).andExpect(status().isCreated());
        conferir("/api/v1/maquinas", "get", 200, mvc.perform(comToken(get("/api/v1/maquinas"), admin)));
        conferir("/api/v1/maquinas/{id}/pontos", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/pontos"), admin)));
        conferir("/api/v1/maquinas/{id}/dispositivos", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/dispositivos"), admin)));
    }

    @Test
    void ingestaoUltimaJanelaESerieDoPonto() throws Exception {
        conferir("/api/v1/telemetria", "post", 201, enviarSimulado(base));
        conferir("/api/v1/telemetria", "post", 200, enviarSimulado(base));
        conferir("/api/v1/maquinas/{id}/ultima-janela", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela"), admin)));
        Long pontoA = jdbc.queryForObject("SELECT id FROM ponto_medicao WHERE maquina_id = ? AND codigo = 'A'",
                Long.class, maquinaId);
        conferir("/api/v1/pontos/{id}/telemetria", "get", 200,
                mvc.perform(comToken(get("/api/v1/pontos/" + pontoA + "/telemetria"), admin)));
    }

    @Test
    void referenciaAvaliacaoAlertasEDiagnostico() throws Exception {
        String rotaRef = "/api/v1/maquinas/" + maquinaId + "/referencias";
        conferir("/api/v1/maquinas/{id}/referencias", "get", 200,
                mvc.perform(comToken(get(rotaRef + "?simulado=true"), admin)));
        prepararReferencia(admin);
        conferir("/api/v1/maquinas/{id}/referencias/recalcular", "post", 201,
                mvc.perform(comToken(post(rotaRef + "/recalcular?simulado=true"), admin)));
        conferir("/api/v1/maquinas/{id}/referencias", "get", 200,
                mvc.perform(comToken(get(rotaRef + "?simulado=true"), admin)));
        conferir("/api/v1/maquinas/{id}/referencias/versoes", "get", 200,
                mvc.perform(comToken(get(rotaRef + "/versoes?simulado=true"), admin)));

        // 4 janelas: a 3ª entra em ALARME (alerta) e a 4ª passa a severidade de 600 z·s (OS)
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, SEVERO);
        conferir("/api/v1/maquinas/{id}/avaliacao", "get", 200, mvc.perform(comToken(get("/api/v1/maquinas/"
                + maquinaId + "/avaliacao?simulado=true"), admin)));
        ResultActions ultima = mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/ultima-janela?simulado=true"), admin));
        conferir("/api/v1/maquinas/{id}/ultima-janela", "get", 200, ultima);
        assertThat(corpo(ultima).at("/pontos/A/avaliacao/estado").asText()).isEqualTo("alarme");
        ResultActions janelas = mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/janelas?simulado=true&size=3"), admin));
        conferir("/api/v1/maquinas/{id}/janelas", "get", 200, janelas);
        assertThat(corpo(janelas).at("/conteudo/0/pontos/B/avaliacao/situacao").asText()).isEqualTo("avaliada");
        Instant agora = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        ResultActions serie = mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/serie?simulado=true&de="
                + agora.minusSeconds(60) + "&ate=" + agora.plusSeconds(120) + "&baldes=10"), admin));
        conferir("/api/v1/maquinas/{id}/serie", "get", 200, serie);
        assertThat(corpo(serie).toString()).contains("\"z_max\":{\"rms_g\":");
        ResultActions lista = mvc.perform(comToken(get("/api/v1/alertas?simulado=true"), admin));
        conferir("/api/v1/alertas", "get", 200, lista);
        long id = corpo(lista).get("conteudo").get(0).get("id").asLong();
        conferir("/api/v1/alertas/{id}/suprimir", "post", 200, mvc.perform(comToken(post("/api/v1/alertas/" + id
                + "/suprimir"), admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"motivo\":\"contrato\",\"minutos\":5}")));
        conferir("/api/v1/alertas/{id}/cancelar-supressao", "post", 200,
                mvc.perform(comToken(post("/api/v1/alertas/" + id + "/cancelar-supressao"), admin)));
        conferir("/api/v1/alertas/{id}/reconhecer", "post", 200,
                mvc.perform(comToken(post("/api/v1/alertas/" + id + "/reconhecer"), admin)));
        conferir("/api/v1/alertas/{id}", "get", 200, mvc.perform(comToken(get("/api/v1/alertas/" + id), admin)));
        conferir("/api/v1/alarmes/limites", "get", 200, mvc.perform(comToken(get("/api/v1/alarmes/limites"), admin)));
        conferir("/api/v1/maquinas/{id}/alarmes/diagnostico", "get", 200, mvc.perform(comToken(get(
                "/api/v1/maquinas/" + maquinaId + "/alarmes/diagnostico?simulado=true"), admin)));

        // a severidade do SEVERO abriu OS
        ResultActions ordens = mvc.perform(comToken(get("/api/v1/ordens-servico?simulado=true"), admin));
        conferir("/api/v1/ordens-servico", "get", 200, ordens);
        long os = corpo(ordens).get("conteudo").get(0).get("id").asLong();
        conferir("/api/v1/ordens-servico/{id}", "get", 200,
                mvc.perform(comToken(get("/api/v1/ordens-servico/" + os), admin)));
        conferir("/api/v1/ordens-servico/{id}/assumir", "post", 200,
                mvc.perform(comToken(post("/api/v1/ordens-servico/" + os + "/assumir"), admin)));
        conferir("/api/v1/ordens-servico/{id}/concluir", "post", 200, mvc.perform(comToken(post(
                "/api/v1/ordens-servico/" + os + "/concluir"), admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"retorno\":\"confirmada\",\"comentario\":\"contrato\","
                        + "\"condicao_encontrada\":\"avanco_excessivo\"}")));

        // conjunto de treino (rotas do serviço de treino, com a chave)
        conferir("/api/v1/treino/servico/conjunto/resumo", "get", 200, mvc.perform(get(
                "/api/v1/treino/servico/conjunto/resumo?simulado=true&maquina_id=" + maquinaId)
                .header("X-Treino-Chave", "chave-treino-teste")));
        ResultActions conjunto = mvc.perform(get("/api/v1/treino/servico/conjunto?simulado=true&tamanho=5&maquina_id="
                + maquinaId).header("X-Treino-Chave", "chave-treino-teste"));
        conferir("/api/v1/treino/servico/conjunto", "get", 200, conjunto);
        assertThat(corpo(conjunto).get("conteudo")).isNotEmpty();
    }

    @Test
    void ensaioResumoECobertura() throws Exception {
        ResultActions aberto = mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":900,\"material\":\"aço\","
                        + "\"avanco_alvo\":0.15,\"observacao\":\"contrato\",\"simulado\":true}"));
        conferir("/api/v1/maquinas/{id}/ensaios", "post", 201, aberto);
        long ensaioId = corpo(aberto).get("id").asLong();
        enviarSimulado(base).andExpect(status().isCreated());

        conferir("/api/v1/ensaios/{id}/encerrar", "post", 200,
                mvc.perform(comToken(post("/api/v1/ensaios/" + ensaioId + "/encerrar"), admin)));
        conferir("/api/v1/ensaios/{id}", "get", 200, mvc.perform(comToken(get("/api/v1/ensaios/" + ensaioId), admin)));
        conferir("/api/v1/maquinas/{id}/ensaios", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios"), admin)));
        conferir("/api/v1/ensaios/{id}/resumo", "get", 200,
                mvc.perform(comToken(get("/api/v1/ensaios/" + ensaioId + "/resumo"), admin)));
        conferir("/api/v1/maquinas/{id}/coleta/cobertura", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/coleta/cobertura?simulado=true"), admin)));
    }

    @Test
    void janelasSerieMaquinaEPlanoDeColeta() throws Exception {
        long ensaioId = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":900,\"simulado\":true}"))
                .andExpect(status().isCreated())).get("id").asLong();
        Map<String, Object> completa = payload(DISPOSITIVO_SIM, base);
        completa.put("modo", "normal");
        completa.put("amostras", 8000);
        completa.put("amostras_esperadas", 8000);
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, completa).andExpect(status().isCreated());

        conferir("/api/v1/maquinas/{id}/janelas", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/janelas"), admin)));
        conferir("/api/v1/ensaios/{id}/janelas", "get", 200,
                mvc.perform(comToken(get("/api/v1/ensaios/" + ensaioId + "/janelas"), admin)));
        conferir("/api/v1/maquinas/{id}/serie", "get", 200, mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/serie?baldes=2&de=" + base.minusSeconds(60) + "&ate=" + base.plusSeconds(60)), admin)));
        conferir("/api/v1/maquinas/{id}", "get", 200,
                mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId), admin)));
        conferir("/api/v1/maquinas/{id}/coleta/plano", "put", 200,
                mvc.perform(comToken(put("/api/v1/maquinas/" + maquinaId + "/coleta/plano"), admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rotacoes_rpm\":[280,560]}")));
        jdbc.update("UPDATE maquina SET rotacoes_coleta_rpm = '{}'");
    }

    @Test
    void fluxoDeEventosEDocumentadoComOsEsquemasDosEventos() {
        JsonNode eventos = documento.at("/paths/~1api~1v1~1maquinas~1{id}~1eventos/get");
        assertThat(eventos.at("/responses/200/content").fieldNames()).toIterable().containsExactly("text/event-stream");
        assertThat(eventos.at("/responses/429/content/application~1json/schema/$ref").asText())
                .isEqualTo("#/components/schemas/ErroResposta");
        JsonNode esquemas = documento.at("/components/schemas");
        assertThat(esquemas.has("JanelaResposta")).isTrue();
        assertThat(esquemas.has("ModoRapidoResposta")).isTrue();
        assertThat(valores(esquemas.at("/RecuperacaoEvento/required")))
                .containsExactlyInAnyOrder("maquina_id", "simulado", "de", "ate", "quantidade");
        assertThat(valores(esquemas.at("/EnsaioEvento/properties/acao/enum")))
                .containsExactly("aberto", "encerrado", "descartado");
        assertThat(esquemas.at("/EnsaioEvento/properties/ensaio/$ref").asText())
                .isEqualTo("#/components/schemas/EnsaioResposta");
        assertThat(valores(esquemas.at("/CoberturaResposta/properties/origem_rotacoes/enum")))
                .containsExactly("parametro", "plano", "usadas");
    }

    @Test
    void modoRapido() throws Exception {
        String rota = "/api/v1/maquinas/" + maquinaId + "/modo-rapido";
        conferir("/api/v1/maquinas/{id}/modo-rapido", "post", 200, mvc.perform(comToken(post(rota), admin)));
        conferir("/api/v1/maquinas/{id}/modo-rapido", "get", 200, mvc.perform(comToken(get(rota), admin)));
        // com o modo rápido ligado a ingestão traz o prazo: todas as chaves presentes
        JsonNode ingestao = corpo(enviarSimulado(base).andExpect(status().isCreated()));
        assertThat(ingestao.has("modo_rapido_ate")).isTrue();
    }

    @Test
    void erros() throws Exception {
        conferir("/api/v1/auth/login", "post", 401, login(ADMIN_EMAIL, "senha-errada", ipNovo()));
        conferir("/api/v1/maquinas", "get", 401, mvc.perform(get("/api/v1/maquinas")));
        conferir("/api/v1/maquinas/{id}/pontos", "get", 404,
                mvc.perform(comToken(get("/api/v1/maquinas/999999/pontos"), admin)));
        conferir("/api/v1/usuarios", "get", 403, mvc.perform(comToken(get("/api/v1/usuarios"), tokenDe("OPERADOR"))));
        // erro de validação traz "campos"
        ResultActions invalido = mvc.perform(post("/api/v1/auth/login").with(ipNovo())
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"a@b.c\"}"));
        conferir("/api/v1/auth/login", "post", 400, invalido);
        assertThat(corpo(invalido).has("campos")).isTrue();
    }

    // ------------------------------------------------------------------ apoio

    /** Confere o status e compara o corpo com o esquema declarado para (rota, método, status). */
    protected void conferir(String rota, String metodo, int statusEsperado, ResultActions resultado) throws Exception {
        resultado.andExpect(status().is(statusEsperado));
        JsonNode conteudo = documento.get("paths").path(rota).path(metodo).path("responses")
                .path(String.valueOf(statusEsperado)).path("content").path("application/json");
        assertThat(conteudo.isMissingNode())
                .as("%s %s não declara resposta %d em application/json", metodo, rota, statusEsperado).isFalse();
        List<String> diferencas = new ArrayList<>();
        comparar(corpo(resultado), conteudo.get("schema"), metodo + " " + rota + " " + statusEsperado, null, diferencas);
        if (!diferencas.isEmpty()) {
            fail("JSON real difere do documento OpenAPI:\n  " + String.join("\n  ", diferencas));
        }
    }

    private void comparar(JsonNode valor, JsonNode esquema, String onde, String nomeEsquema, List<String> diferencas) {
        if (valor == null || esquema == null) {
            return;
        }
        if (valor.isNull()) {
            if (!permiteNulo(esquema)) {
                diferencas.add(onde + ": veio nulo, o documento não permite nulo");
            }
            return;
        }
        if (esquema.has("anyOf")) {
            // "objeto ou null": o valor (não nulo) é conferido contra o ramo que não é null
            for (JsonNode ramo : esquema.get("anyOf")) {
                if (!permiteNulo(ramo)) {
                    comparar(valor, ramo, onde, nomeEsquema, diferencas);
                }
            }
            return;
        }
        if (esquema.has("$ref")) {
            String nome = esquema.get("$ref").asText().replace("#/components/schemas/", "");
            JsonNode alvo = documento.at("/components/schemas").get(nome);
            if (alvo == null) {
                diferencas.add(onde + ": esquema " + nome + " não existe no documento");
                return;
            }
            comparar(valor, alvo, onde, nome, diferencas);
            return;
        }
        if (esquema.has("enum")) {
            if (!valores(esquema.get("enum")).contains(valor.asText())) {
                diferencas.add(onde + ": valor '" + valor.asText() + "' fora do enum " + valores(esquema.get("enum")));
            }
            return;
        }
        if (valor.isArray()) {
            if (!esquema.has("items")) {
                diferencas.add(onde + ": veio lista, o documento não declara itens");
                return;
            }
            for (int i = 0; i < valor.size(); i++) {
                comparar(valor.get(i), esquema.get("items"), onde + "[" + i + "]", null, diferencas);
            }
            return;
        }
        if (!valor.isObject()) {
            return;
        }
        JsonNode propriedades = esquema.get("properties");
        JsonNode adicionais = esquema.get("additionalProperties");
        if (propriedades == null && adicionais != null && adicionais.isObject()) {
            // mapa (pontos por código, canais por código): cada valor segue o mesmo esquema
            valor.fields().forEachRemaining(e -> comparar(e.getValue(), adicionais, onde + "." + e.getKey(), null,
                    diferencas));
            return;
        }
        if (propriedades == null) {
            diferencas.add(onde + ": veio objeto, o documento não declara propriedades");
            return;
        }
        Set<String> reais = new TreeSet<>();
        valor.fieldNames().forEachRemaining(reais::add);
        Set<String> declaradas = new TreeSet<>();
        propriedades.fieldNames().forEachRemaining(declaradas::add);

        Set<String> soNoJson = new TreeSet<>(reais);
        soNoJson.removeAll(declaradas);
        // só pode faltar no JSON o que o documento não marca como obrigatório
        Set<String> obrigatoriasAusentes = new TreeSet<>();
        if (esquema.has("required")) {
            esquema.get("required").forEach(nome -> obrigatoriasAusentes.add(nome.asText()));
        }
        obrigatoriasAusentes.removeAll(reais);
        if (!soNoJson.isEmpty()) {
            diferencas.add(onde + ": chaves no JSON que o documento não declara: " + soNoJson);
        }
        if (!obrigatoriasAusentes.isEmpty()) {
            diferencas.add(onde + ": propriedades obrigatórias do documento ausentes no JSON: " + obrigatoriasAusentes);
        }
        for (String chave : reais) {
            if (declaradas.contains(chave)) {
                comparar(valor.get(chave), propriedades.get(chave), onde + "." + chave, null, diferencas);
            }
        }
    }

    private static boolean permiteNulo(JsonNode esquema) {
        JsonNode tipo = esquema.get("type");
        if (tipo != null && tipo.isArray()) {
            for (JsonNode t : tipo) {
                if ("null".equals(t.asText())) {
                    return true;
                }
            }
        }
        if (esquema.has("anyOf")) {
            for (JsonNode ramo : esquema.get("anyOf")) {
                if (permiteNulo(ramo)) {
                    return true;
                }
            }
        }
        if (tipo != null && "null".equals(tipo.asText())) {
            return true;
        }
        return esquema.path("nullable").asBoolean(false);
    }

    private List<String> nomesDosParametros(String rota, String metodo) {
        List<String> nomes = new ArrayList<>();
        JsonNode parametros = documento.get("paths").path(rota).path(metodo).path("parameters");
        parametros.forEach(p -> nomes.add(p.get("name").asText()));
        return nomes;
    }

    private static List<String> valores(JsonNode lista) {
        List<String> saida = new ArrayList<>();
        Iterator<JsonNode> it = lista.elements();
        while (it.hasNext()) {
            saida.add(it.next().asText());
        }
        return saida;
    }
}
