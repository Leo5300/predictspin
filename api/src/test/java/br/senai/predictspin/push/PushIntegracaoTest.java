package br.senai.predictspin.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import br.senai.predictspin.AlarmeIntegracaoBase;

/**
 * Push de alarme com um servidor HTTP falso no lugar do serviço do Expo (nenhum teste chama o serviço real).
 * O token de acesso aqui é um valor de teste, não um segredo.
 */
class PushIntegracaoTest extends AlarmeIntegracaoBase {

    /** Como o falso responde: ok, ou demora mais que o tempo limite (serviço fora do ar). */
    enum Modo { OK, FORA_DO_AR }

    static final HttpServer EXPO;
    static final List<JsonNode> LOTES = new CopyOnWriteArrayList<>();
    static final List<String> AUTORIZACOES = new CopyOnWriteArrayList<>();
    static final AtomicReference<Modo> MODO = new AtomicReference<>(Modo.OK);
    static final com.fasterxml.jackson.databind.ObjectMapper LEITOR = new com.fasterxml.jackson.databind.ObjectMapper();

    static {
        try {
            EXPO = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        EXPO.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(4));
        EXPO.createContext("/--/api/v2/push/send", PushIntegracaoTest::responder);
        EXPO.start();
    }

    private static void responder(HttpExchange ex) throws IOException {
        JsonNode lote = LEITOR.readTree(ex.getRequestBody().readAllBytes());
        LOTES.add(lote);
        AUTORIZACOES.add(String.valueOf(ex.getRequestHeaders().getFirst("Authorization")));
        if (MODO.get() == Modo.FORA_DO_AR) {
            try {
                Thread.sleep(4000); // mais que o tempo limite do teste (1500 ms)
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            ex.close();
            return;
        }
        StringBuilder tickets = new StringBuilder("{\"data\":[");
        for (int i = 0; i < lote.size(); i++) {
            String to = lote.get(i).get("to").asText();
            tickets.append(i == 0 ? "" : ",").append(to.contains("morto")
                    ? "{\"status\":\"error\",\"message\":\"not registered\",\"details\":{\"error\":\"DeviceNotRegistered\"}}"
                    : "{\"status\":\"ok\",\"id\":\"t" + i + "\"}");
        }
        byte[] b = tickets.append("]}").toString().getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(200, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }

    @DynamicPropertySource
    static void expo(DynamicPropertyRegistry r) {
        r.add("ps.push.habilitado", () -> "true");
        r.add("ps.push.url", () -> "http://127.0.0.1:" + EXPO.getAddress().getPort() + "/--/api/v2/push/send");
        r.add("ps.push.timeout-ms", () -> "1500");
        r.add("ps.push.token-acesso", () -> "valor-de-teste");
    }

    @AfterAll
    static void parar() {
        EXPO.stop(0);
    }

    /** A em ALARME pouco acima do limite (z ≈ 5,5): não abre OS por severidade em poucas janelas. */
    private static final double[] A_ALARME_LEVE = {0.1785, CORTE[1], CORTE[2]};
    /** A em ATENÇÃO (z ≈ 4). */
    private static final double[] A_ATENCAO = {0.168, CORTE[1], CORTE[2]};

    @Autowired
    private PushService push;

    private String admin;

    @BeforeEach
    void preparar() throws Exception {
        LOTES.clear();
        AUTORIZACOES.clear();
        MODO.set(Modo.OK);
        push.zerarContadores();
        admin = tokenAdmin();
        prepararReferencia(admin);
    }

    private JsonNode registrar(String token, String expo, String plataforma, int esperado) throws Exception {
        return corpo(mvc.perform(comToken(put("/api/v1/push/aparelhos"), token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("token", expo, "plataforma", plataforma))))
                .andExpect(status().is(esperado)));
    }

    private static String expo(String nome) {
        return "ExponentPushToken[" + nome + "]";
    }

    private void aguardarPush() throws InterruptedException {
        assertThat(push.aguardarOcioso(Duration.ofSeconds(10))).as("fila do push esvaziou").isTrue();
    }

    /** Mensagens recebidas pelo falso com o tipo dado (alarme, os, alerta). */
    private static List<JsonNode> mensagens(String tipo) {
        List<JsonNode> r = new ArrayList<>();
        LOTES.forEach(l -> l.forEach(m -> {
            if (tipo.equals(m.get("data").get("tipo").asText())) {
                r.add(m);
            }
        }));
        return r;
    }

    private static List<String> destinos(List<JsonNode> ms) {
        return ms.stream().map(m -> m.get("to").asText()).sorted().toList();
    }

    private JsonNode diagnostico() throws Exception {
        return corpo(mvc.perform(comToken(get("/api/v1/push/diagnostico"), admin)).andExpect(status().isOk()));
    }

    @Test
    void alarmeNovoEnviaUmaVezParaTodosEMesmaOcorrenciaNaoReenvia() throws Exception {
        registrar(admin, expo("admin"), "ios", 200);
        registrar(tokenDe("TECNICO"), expo("tecnico"), "android", 200);
        registrar(tokenDe("OPERADOR"), expo("operador"), "android", 200);

        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, A_ALARME_LEVE);
        aguardarPush();
        List<JsonNode> alarmes = mensagens("alarme");
        assertThat(destinos(alarmes)).containsExactly(expo("admin"), expo("operador"), expo("tecnico"));
        JsonNode m = alarmes.get(0);
        long alertaId = jdbc.queryForObject("SELECT id FROM alerta", Long.class);
        assertThat(m.get("title").asText()).isEqualTo("SIMULADO · ALARME · TORNO-01 · ponto A");
        assertThat(m.get("body").asText()).startsWith("Eixo-árvore e mancal dianteiro: A·").endsWith("Toque para ver.");
        assertThat(m.get("channelId").asText()).isEqualTo("alarmes");
        assertThat(m.get("priority").asText()).isEqualTo("high");
        assertThat(m.get("data").get("alerta_id").asLong()).isEqualTo(alertaId);
        assertThat(m.get("data").get("simulado").asBoolean()).isTrue();
        assertThat(AUTORIZACOES).allMatch("Bearer valor-de-teste"::equals);

        // continua em ALARME, desce para ATENÇÃO e volta a ALARME: o mesmo alerta, nenhum push novo
        t = enviarSequencia(t, 4, 1120, A_ALARME_LEVE);
        t = enviarSequencia(t, 5, 1120, new double[] {0.1645, CORTE[1], CORTE[2]});
        assertThat(jdbc.queryForObject("SELECT nivel FROM alerta", String.class)).isEqualTo("atencao");
        enviarSequencia(t, 4, 1120, A_ALARME_LEVE);
        assertThat(jdbc.queryForObject("SELECT nivel FROM alerta", String.class)).isEqualTo("alarme");
        aguardarPush();
        assertThat(mensagens("alarme")).hasSize(3);
        assertThat(contar("alerta")).isEqualTo(1);
        JsonNode d = diagnostico();
        assertThat(d.get("enviados").asLong()).isEqualTo(3);
        assertThat(d.get("falhos").asLong()).isZero();
        assertThat(d.get("aparelhos_ativos").asLong()).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT resultado FROM push_envio", String.class)).isEqualTo("enviado");
    }

    @Test
    void atencaoNormalizacaoEReconhecimentoNaoEnviam() throws Exception {
        registrar(admin, expo("admin"), "ios", 200);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 6, 1120, A_ATENCAO);
        long id = jdbc.queryForObject("SELECT id FROM alerta", Long.class);
        mvc.perform(comToken(post("/api/v1/alertas/" + id + "/reconhecer"), admin)).andExpect(status().isOk());
        enviarSequencia(t, 5, 1120, CORTE);
        assertThat(jdbc.queryForObject("SELECT estado FROM alerta", String.class)).isEqualTo("encerrado");
        aguardarPush();
        assertThat(LOTES).isEmpty();
        assertThat(contar("push_envio")).isZero();
    }

    @Test
    void alarmeQueReabreEmCicloRespeitaOIntervaloPorPontoETipo() throws Exception {
        registrar(admin, expo("admin"), "ios", 200);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, A_ALARME_LEVE);
        t = enviarSequencia(t, 5, 1120, CORTE);   // normaliza
        t = enviarSequencia(t, 4, 1120, A_ALARME_LEVE); // reabre: alerta novo, mesmo ponto e tipo
        aguardarPush();
        assertThat(contar("alerta")).isEqualTo(2);
        assertThat(mensagens("alarme")).hasSize(1);
        assertThat(diagnostico().get("segurados_pelo_intervalo").asLong()).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT resultado FROM push_envio ORDER BY id", String.class))
                .containsExactly("enviado", "intervalo");

        // passados os 15 min (ps.push.intervalo-min), a próxima reabertura volta a avisar
        jdbc.update("UPDATE push_envio SET criado_em = criado_em - interval '16 minutes'");
        t = enviarSequencia(t, 5, 1120, CORTE);
        enviarSequencia(t, 4, 1120, A_ALARME_LEVE);
        aguardarPush();
        assertThat(contar("alerta")).isEqualTo(3);
        assertThat(mensagens("alarme")).hasSize(2);
    }

    @Test
    void osAbertaEscalonaParaQuemConsertaEInstrumentoDizQueEOSensor() throws Exception {
        registrar(admin, expo("admin"), "ios", 200);
        registrar(tokenDe("TECNICO"), expo("tecnico"), "android", 200);
        registrar(tokenDe("OPERADOR"), expo("operador"), "android", 200);

        // A forte (z ≈ 66, como no teste da OS): alarme e, duas janelas depois do atraso, OS por severidade
        // (segundo push, de propósito)
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 6, 1120,
                new double[] {SEVERO[0], CORTE[1], CORTE[2]});
        aguardarPush();
        assertThat(contar("ordem_servico")).isEqualTo(1);
        assertThat(destinos(mensagens("alarme"))).hasSize(3);
        List<JsonNode> os = mensagens("os");
        assertThat(destinos(os)).containsExactly(expo("admin"), expo("tecnico"));
        assertThat(os.get(0).get("title").asText()).isEqualTo("SIMULADO · OS ABERTA · TORNO-01 · ponto A");
        assertThat(os.get(0).get("body").asText()).matches("OS-\\d{4}-\\d{4} · .*Toque para ver\\.");
        assertThat(os.get(0).get("data").get("os_id").asLong())
                .isEqualTo(jdbc.queryForObject("SELECT id FROM ordem_servico", Long.class));

        // sensor C some do envio por 30 s: alerta de instrumento, só para quem conserta, dizendo que é o sensor
        for (int i = 0; i < 7; i++) {
            Map<String, Object> p = janela(DISPOSITIVO_SIM, t, 1120, CORTE[0], CORTE[1], CORTE[2]);
            ((Map<?, ?>) p.get("pontos")).remove("C");
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
            t = t.plusSeconds(5);
        }
        aguardarPush();
        List<JsonNode> sensor = mensagens("alerta");
        assertThat(destinos(sensor)).containsExactly(expo("admin"), expo("tecnico"));
        assertThat(sensor.get(0).get("title").asText()).isEqualTo("SIMULADO · SENSOR · TORNO-01 · ponto C");
        assertThat(sensor.get(0).get("body").asText()).startsWith("Problema no sensor, não na máquina: o sensor sumiu");
    }

    @Test
    void deviceNotRegisteredDesativaOToken() throws Exception {
        registrar(admin, expo("admin"), "ios", 200);
        registrar(tokenDe("TECNICO"), expo("morto-1"), "android", 200);
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, A_ALARME_LEVE);
        aguardarPush();
        assertThat(jdbc.queryForObject("SELECT ativo FROM push_aparelho WHERE token = ?", Boolean.class,
                expo("morto-1"))).isFalse();
        JsonNode d = diagnostico();
        assertThat(d.get("enviados").asLong()).isEqualTo(1);
        assertThat(d.get("tokens_desativados").asLong()).isEqualTo(1);
        assertThat(d.get("aparelhos_ativos").asLong()).isEqualTo(1);
    }

    @Test
    void servicoForaDoArNaoAfetaAAvaliacao() throws Exception {
        registrar(admin, expo("admin"), "ios", 200);
        MODO.set(Modo.FORA_DO_AR);
        long inicio = System.nanoTime();
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, A_ALARME_LEVE);
        t = enviarSequencia(t, 2, 1120, A_ALARME_LEVE);
        long ms = (System.nanoTime() - inicio) / 1_000_000;
        // a avaliação andou: alerta aberto e o ponto em ALARME, sem esperar o push
        assertThat(jdbc.queryForObject("SELECT nivel FROM alerta", String.class)).isEqualTo("alarme");
        assertThat(estadoDoPonto("A")).isEqualTo(2);
        aguardarPush();
        // uma tentativa e no máximo uma nova; a falha virou contador, não erro
        assertThat(LOTES).hasSize(2);
        assertThat(diagnostico().get("falhos").asLong()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT resultado FROM push_envio", String.class)).isEqualTo("falhou");
        assertThat(ms).as("6 janelas sem esperar o Expo (2 × 4 s)").isLessThan(20_000);
        MODO.set(Modo.OK);
        enviarSequencia(t, 1, 1120, A_ALARME_LEVE);
        assertThat(contar("alerta")).isEqualTo(1);
    }

    @Test
    void aparelhosDoProprioUsuarioEDiagnosticoSoAdmin() throws Exception {
        String tecnico = tokenDe("TECNICO");
        JsonNode r = registrar(tecnico, expo("compartilhado"), "android", 200);
        assertThat(r.get("plataforma").asText()).isEqualTo("android");
        assertThat(r.get("ativo").asBoolean()).isTrue();
        assertThat(r.get("envio_habilitado").asBoolean()).isTrue();
        assertThat(r.has("token")).isFalse();
        registrar(tecnico, "qualquer-coisa", "android", 400);
        registrar(tecnico, expo("x"), "windows", 400);

        // outra pessoa entra no mesmo celular: o token passa a ser dela
        String operador = tokenDe("OPERADOR");
        registrar(operador, expo("compartilhado"), "android", 200);
        assertThat(contar("push_aparelho")).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT u.papel FROM push_aparelho a JOIN usuario u ON u.id = a.usuario_id""", String.class))
                .isEqualTo("OPERADOR");

        // remover só mexe no que é do próprio usuário; responde 204 sempre
        mvc.perform(comToken(post("/api/v1/push/aparelhos/remover"), tecnico).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + expo("compartilhado") + "\"}")).andExpect(status().isNoContent());
        assertThat(contar("push_aparelho")).isEqualTo(1);
        mvc.perform(comToken(post("/api/v1/push/aparelhos/remover"), operador).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + expo("compartilhado") + "\"}")).andExpect(status().isNoContent());
        assertThat(contar("push_aparelho")).isZero();

        // no máximo ps.push.max-aparelhos (10) ativos por usuário: o mais antigo sai
        for (int i = 0; i < 11; i++) {
            registrar(tecnico, expo("aparelho-" + i), "ios", 200);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM push_aparelho WHERE ativo", Long.class)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT ativo FROM push_aparelho WHERE token = ?", Boolean.class,
                expo("aparelho-0"))).isFalse();

        mvc.perform(comToken(get("/api/v1/push/diagnostico"), tecnico)).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/push/aparelhos").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        JsonNode d = diagnostico();
        assertThat(d.get("habilitado").asBoolean()).isTrue();
        assertThat(d.get("intervalo_min").asInt()).isEqualTo(15);
    }
}
