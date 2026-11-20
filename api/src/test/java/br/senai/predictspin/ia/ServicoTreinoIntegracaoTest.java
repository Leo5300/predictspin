package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import br.senai.predictspin.IntegracaoBase;

/**
 * Botão Treinar com o serviço de treino configurado: a API acorda o serviço (que pode estar dormindo), pede o treino
 * com a chave e acompanha o estado. Um servidor HTTP falso faz o papel do serviço.
 */
class ServicoTreinoIntegracaoTest extends IntegracaoBase {

    static final HttpServer SERVICO;
    static final AtomicInteger DORMINDO = new AtomicInteger();
    static final AtomicInteger RESPOSTA_TREINAR = new AtomicInteger(202);
    static final List<String> CHAVES = new CopyOnWriteArrayList<>();
    static final List<String> CORPOS = new CopyOnWriteArrayList<>();

    static {
        try {
            SERVICO = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        SERVICO.createContext("/saude", ex -> responder(ex, DORMINDO.getAndDecrement() > 0 ? 503 : 200, "{\"ok\":true}"));
        SERVICO.createContext("/treinar", ex -> {
            CHAVES.add(ex.getRequestHeaders().getFirst("X-Treino-Chave"));
            CORPOS.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            responder(ex, RESPOSTA_TREINAR.get(), "{}");
        });
        SERVICO.start();
    }

    private static void responder(HttpExchange ex, int status, String corpo) throws IOException {
        byte[] b = corpo.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(status, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }

    @DynamicPropertySource
    static void servico(DynamicPropertyRegistry r) {
        r.add("ps.treino.url", () -> "http://127.0.0.1:" + SERVICO.getAddress().getPort() + "/");
        r.add("ps.treino.espera-acordar-s", () -> "3");
    }

    @AfterAll
    static void parar() {
        SERVICO.stop(0);
    }

    @Autowired
    private TreinoService treino;

    @BeforeEach
    void preparar() {
        treino.intervaloSondagem(Duration.ofMillis(100));
        CHAVES.clear();
        CORPOS.clear();
        RESPOSTA_TREINAR.set(202);
    }

    private JsonNode esperarEstado(String token, long id, String estado) throws Exception {
        JsonNode t = null;
        for (int i = 0; i < 100; i++) {
            t = corpo(mvc.perform(comToken(get("/api/v1/treino/trabalhos/" + id), token)));
            if (estado.equals(t.get("estado").asText())) {
                return t;
            }
            Thread.sleep(100);
        }
        return t;
    }

    @Test
    void acordaOServicoDormindoEPedeOTreinoComAChave() throws Exception {
        String admin = tokenAdmin();
        DORMINDO.set(3); // as 3 primeiras sondagens respondem 503
        JsonNode t = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId
                + "/modelos/treinar?simulado=true"), admin)).andExpect(status().isAccepted()));
        assertThat(t.get("estado").asText()).isEqualTo("acordando");
        assertThat(t.get("mensagem").asText()).isEqualTo("acordando o serviço de treino");
        assertThat(t.get("comando").isNull()).isTrue();
        JsonNode executando = esperarEstado(admin, t.get("id").asLong(), "executando");
        assertThat(executando.get("estado").asText()).isEqualTo("executando");
        assertThat(CHAVES).containsExactly("chave-treino-teste");
        assertThat(CORPOS).containsExactly("{\"trabalho_id\":" + t.get("id").asLong() + "}");
        assertThat(corpo(mvc.perform(comToken(get("/api/v1/alarmes/limites"), admin))).get("treino")
                .get("servico_configurado").asBoolean()).isTrue();
    }

    @Test
    void servicoQueNaoAcordaOuRecusaFazOTrabalhoFalhar() throws Exception {
        String admin = tokenAdmin();
        DORMINDO.set(1000);
        long id = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId
                + "/modelos/treinar?simulado=true"), admin))).get("id").asLong();
        JsonNode t = esperarEstado(admin, id, "falhou");
        assertThat(t.get("mensagem").asText()).contains("não respondeu em 3 s");

        DORMINDO.set(0);
        RESPOSTA_TREINAR.set(409);
        long outro = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId
                + "/modelos/treinar?simulado=true"), admin))).get("id").asLong();
        assertThat(esperarEstado(admin, outro, "falhou").get("mensagem").asText()).contains("HTTP 409");
    }
}
