package br.senai.predictspin.eventos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.IntegracaoBase;

/**
 * Eventos ao vivo por HTTP de verdade (porta aleatória): o que importa aqui é o fluxo, os
 * cabeçalhos e o que acontece quando o cliente some, e isso o MockMvc não exercita.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// Prazo de cada teste: um fluxo que não abre ou um evento que não chega faz o teste falhar com mensagem
// clara, nunca ficar parado (já ficou, 3 vezes, na máquina de desenvolvimento). Fica acima do prazo de
// cada espera (ESPERA, 10 s) e de cada pedido HTTP.
@Timeout(value = 90, unit = TimeUnit.SECONDS)
@TestPropertySource(properties = {
        "predictspin.eventos.max-por-usuario=2",
        "predictspin.eventos.max-total=3",
        "predictspin.eventos.batimento=300ms"})
class EventosIntegracaoTest extends IntegracaoBase {

    private static final Duration ESPERA = Duration.ofSeconds(10);

    @LocalServerPort
    private int porta;

    @Autowired
    private EventosService eventos;

    private final HttpClient http = HttpClient.newHttpClient();

    /**
     * Envia o pedido com prazo. O cliente HTTP do JDK, sem prazo, espera para sempre os cabeçalhos de
     * uma resposta que não vem; aqui o teste falha dizendo qual pedido ficou sem resposta.
     */
    private <T> HttpResponse<T> enviar(HttpRequest.Builder pedido, HttpResponse.BodyHandler<T> corpo)
            throws IOException, InterruptedException {
        HttpRequest requisicao = pedido.timeout(ESPERA).build();
        try {
            return http.send(requisicao, corpo);
        } catch (HttpTimeoutException e) {
            throw new AssertionError("O servidor não respondeu em " + ESPERA.toSeconds() + " s a "
                    + requisicao.method() + " " + requisicao.uri().getPath() + " (conexões de eventos abertas: "
                    + eventos.conexoes() + ")", e);
        }
    }
    private final List<Fluxo> abertos = new ArrayList<>();
    private final Instant base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(5, ChronoUnit.MINUTES);

    @AfterEach
    void fecharFluxos() {
        abertos.forEach(Fluxo::fechar);
        // cliente que some é percebido na escrita seguinte (o batimento) e a vaga é liberada
        esperar(() -> eventos.conexoes() == 0);
    }

    /** Um cliente SSE: lê as linhas do fluxo em outra thread. */
    private final class Fluxo {
        private final HttpResponse<InputStream> resposta;
        private final List<String> linhas = new CopyOnWriteArrayList<>();

        private Fluxo(String token, String consulta) throws IOException, InterruptedException {
            HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(
                            "http://localhost:" + porta + "/api/v1/maquinas/" + maquinaId + "/eventos" + consulta))
                    .header("Accept", "text/event-stream");
            if (token != null) {
                pedido.header("Authorization", "Bearer " + token);
            }
            resposta = enviar(pedido, HttpResponse.BodyHandlers.ofInputStream());
            abertos.add(this);
            if (resposta.statusCode() == 200) {
                Thread leitor = new Thread(this::ler, "cliente-sse-de-teste");
                leitor.setDaemon(true);
                leitor.start();
            }
        }

        private void ler() {
            try (BufferedReader leitor = new BufferedReader(
                    new InputStreamReader(resposta.body(), StandardCharsets.UTF_8))) {
                String linha;
                while ((linha = leitor.readLine()) != null) {
                    linhas.add(linha);
                }
            } catch (IOException e) {
                // fluxo fechado pelo teste ou pelo servidor
            }
        }

        private int status() {
            return resposta.statusCode();
        }

        private String corpoDeErro() throws IOException {
            return new String(resposta.body().readAllBytes(), StandardCharsets.UTF_8);
        }

        /** Quantos eventos com esse nome já chegaram. */
        private long quantos(String nome) {
            return linhas.stream().filter(l -> l.equals("event:" + nome)).count();
        }

        /** Corpo (JSON) do n-ésimo evento com esse nome, esperando até ele chegar. */
        private JsonNode evento(String nome, int ordem) throws IOException {
            esperar(() -> quantos(nome) >= ordem && dados(nome, ordem) != null);
            return json.readTree(dados(nome, ordem));
        }

        private String dados(String nome, int ordem) {
            int vistos = 0;
            List<String> copia = List.copyOf(linhas);
            for (int i = 0; i < copia.size() - 1; i++) {
                if (copia.get(i).equals("event:" + nome) && ++vistos == ordem) {
                    String seguinte = copia.get(i + 1);
                    return seguinte.startsWith("data:") ? seguinte.substring(5) : null;
                }
            }
            return null;
        }

        private void fechar() {
            try {
                resposta.body().close();
            } catch (IOException e) {
                // já fechado
            }
        }
    }

    private static void esperar(BooleanSupplier condicao) {
        long limite = System.nanoTime() + ESPERA.toNanos();
        while (!condicao.getAsBoolean()) {
            if (System.nanoTime() > limite) {
                throw new AssertionError("condição não atingida em " + ESPERA.toSeconds() + " s");
            }
            try {
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        }
    }

    private static void pausa(long ms) throws InterruptedException {
        Thread.sleep(ms);
    }

    // ------------------------------------------------------------------ testes

    @Test
    void recebeAJanelaDepoisDaIngestaoEReenvioNaoGeraEvento() throws Exception {
        Fluxo fluxo = new Fluxo(tokenDe("OPERADOR"), "?simulado=true");
        assertThat(fluxo.status()).isEqualTo(200);
        assertThat(fluxo.resposta.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
        assertThat(fluxo.resposta.headers().firstValue("Cache-Control")).contains("no-cache");
        assertThat(fluxo.resposta.headers().firstValue("X-Accel-Buffering")).contains("no");

        // o primeiro evento é o estado do modo rápido
        JsonNode estado = fluxo.evento("modo_rapido", 1);
        assertThat(estado.get("ativo").asBoolean()).isFalse();
        assertThat(estado.get("maquina_id").asLong()).isEqualTo(maquinaId);

        long janelaId = corpo(enviarSimulado(base).andExpect(status().isCreated())).get("janela_id").asLong();

        JsonNode janela = fluxo.evento("janela", 1);
        assertThat(janela.get("id").asLong()).isEqualTo(janelaId);
        assertThat(janela.get("medido_em").asText()).isEqualTo(base.toString());
        assertThat(janela.get("simulado").asBoolean()).isTrue();
        assertThat(janela.get("dispositivo").asText()).isEqualTo(DISPOSITIVO_SIM);
        assertThat(janela.get("modo").asText()).isEqualTo("normal");
        assertThat(janela.get("pontos").get("B").get("rms_g").asDouble()).isEqualTo(0.20);
        assertThat(janela.get("pontos").get("A").get("descricao").asText()).isEqualTo("Cabeçote");
        assertThat(janela.get("canais").get("corrente_a").get("valor").asDouble()).isEqualTo(4.2);

        // reenvio (200) não publica; janela de dispositivo real não passa no filtro simulado=true
        enviarSimulado(base).andExpect(status().isOk());
        enviarReal(base.plusSeconds(5)).andExpect(status().isCreated());
        enviarSimulado(base.plusSeconds(10)).andExpect(status().isCreated());

        JsonNode segunda = fluxo.evento("janela", 2);
        assertThat(segunda.get("medido_em").asText()).isEqualTo(base.plusSeconds(10).toString());
        pausa(400);
        assertThat(fluxo.quantos("janela")).isEqualTo(2);
    }

    @Test
    void semEventoChegaOBatimento() throws Exception {
        Fluxo fluxo = new Fluxo(tokenDe("OPERADOR"), "");
        esperar(() -> fluxo.linhas.contains(":batimento"));
    }

    @Test
    void ensaioEModoRapidoChegamAoTecnicoEOperadorNaoVeEnsaio() throws Exception {
        String tokenTecnico = tokenDe("TECNICO");
        Fluxo tecnico = new Fluxo(tokenTecnico, "");
        Fluxo operador = new Fluxo(tokenDe("OPERADOR"), "");
        tecnico.evento("modo_rapido", 1);
        operador.evento("modo_rapido", 1);

        long ensaioId = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tokenTecnico)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":900,\"simulado\":true}"))
                .andExpect(status().isCreated())).get("id").asLong();
        JsonNode aberto = tecnico.evento("ensaio", 1);
        assertThat(aberto.get("acao").asText()).isEqualTo("aberto");
        assertThat(aberto.get("ensaio").get("id").asLong()).isEqualTo(ensaioId);
        assertThat(aberto.get("ensaio").get("aberto").asBoolean()).isTrue();
        assertThat(aberto.get("ensaio").get("rotacao_alvo_rpm").asInt()).isEqualTo(900);

        mvc.perform(comToken(post("/api/v1/ensaios/" + ensaioId + "/encerrar"), tokenTecnico)).andExpect(status().isOk());
        assertThat(tecnico.evento("ensaio", 2).get("acao").asText()).isEqualTo("encerrado");
        mvc.perform(comToken(post("/api/v1/ensaios/" + ensaioId + "/descartar"), tokenTecnico)).andExpect(status().isOk());
        assertThat(tecnico.evento("ensaio", 3).get("acao").asText()).isEqualTo("descartado");

        String rota = "/api/v1/maquinas/" + maquinaId + "/modo-rapido";
        String prazo = corpo(mvc.perform(comToken(post(rota), tokenTecnico))).get("modo_rapido_ate").asText();
        JsonNode ligado = operador.evento("modo_rapido", 2);
        assertThat(ligado.get("ativo").asBoolean()).isTrue();
        assertThat(ligado.get("modo_rapido_ate").asText()).isEqualTo(prazo);
        mvc.perform(comToken(delete(rota), tokenTecnico)).andExpect(status().isOk());
        assertThat(operador.evento("modo_rapido", 3).get("ativo").asBoolean()).isFalse();
        assertThat(tecnico.evento("modo_rapido", 3).get("ativo").asBoolean()).isFalse();

        assertThat(operador.quantos("ensaio")).isZero();
    }

    @Test
    void limitePorUsuarioResponde429ELimiteTotal503EmJson() throws Exception {
        String usuario = tokenDe("OPERADOR");
        assertThat(new Fluxo(usuario, "").status()).isEqualTo(200);
        assertThat(new Fluxo(usuario, "").status()).isEqualTo(200);

        Fluxo terceiro = new Fluxo(usuario, "");
        assertThat(terceiro.status()).isEqualTo(429);
        assertThat(terceiro.resposta.headers().firstValue("Retry-After")).contains("10");
        assertThat(terceiro.resposta.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
        JsonNode erro = json.readTree(terceiro.corpoDeErro());
        assertThat(erro.get("status").asInt()).isEqualTo(429);
        assertThat(erro.get("mensagem").asText()).contains("por usuário");

        assertThat(new Fluxo(tokenDe("TECNICO"), "").status()).isEqualTo(200);
        Fluxo alemDoTotal = new Fluxo(tokenAdmin(), "");
        assertThat(alemDoTotal.status()).isEqualTo(503);
        assertThat(json.readTree(alemDoTotal.corpoDeErro()).get("mensagem").asText()).contains("limite de 3");
        assertThat(eventos.conexoes()).isEqualTo(3);
    }

    @Test
    void clienteQueFechaLiberaAVagaEAIngestaoContinua() throws Exception {
        String usuario = tokenDe("OPERADOR");
        Fluxo primeiro = new Fluxo(usuario, "");
        Fluxo segundo = new Fluxo(usuario, "");
        primeiro.evento("modo_rapido", 1);
        segundo.evento("modo_rapido", 1);

        primeiro.fechar();
        esperar(() -> eventos.conexoes() == 1);

        // com um cliente caído e outro vivo, a ingestão segue respondendo e o vivo recebe
        enviarSimulado(base).andExpect(status().isCreated());
        assertThat(segundo.evento("janela", 1).get("medido_em").asText()).isEqualTo(base.toString());
        assertThat(new Fluxo(usuario, "").status()).isEqualTo(200);
    }

    @Test
    void exigeTokenNoCabecalhoENuncaNaUrl() throws Exception {
        assertThat(new Fluxo(null, "").status()).isEqualTo(401);
        assertThat(new Fluxo(null, "?access_token=" + tokenAdmin()).status()).isEqualTo(401);
        assertThat(new Fluxo("token-invalido", "").status()).isEqualTo(401);
        assertThat(eventos.conexoes()).isZero();
    }

    @Test
    void maquinaInexistenteResponde404EmJson() throws Exception {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(
                        URI.create("http://localhost:" + porta + "/api/v1/maquinas/999999/eventos"))
                .header("Accept", "text/event-stream")
                .header("Authorization", "Bearer " + tokenAdmin());
        HttpResponse<String> resposta = enviar(pedido, HttpResponse.BodyHandlers.ofString());
        assertThat(resposta.statusCode()).isEqualTo(404);
        assertThat(json.readTree(resposta.body()).get("mensagem").asText()).contains("não encontrada");
    }

    @Test
    void servidorQueNaoRespondeFazOTesteFalharComMensagemClaraEmVezDeFicarParado() throws Exception {
        try (ServerSocket mudo = new ServerSocket(0)) {
            Thread aceita = new Thread(() -> {
                try {
                    mudo.accept();
                    Thread.sleep(30_000);
                } catch (IOException | InterruptedException e) {
                    // o teste terminou
                }
            }, "servidor-mudo-de-teste");
            aceita.setDaemon(true);
            aceita.start();
            HttpRequest.Builder pedido = HttpRequest.newBuilder(
                    URI.create("http://localhost:" + mudo.getLocalPort() + "/api/v1/maquinas/1/eventos"));

            assertThatThrownBy(() -> enviar(pedido, HttpResponse.BodyHandlers.ofString()))
                    .isInstanceOf(AssertionError.class)
                    .hasMessageContaining("O servidor não respondeu em 10 s")
                    .hasMessageContaining("/api/v1/maquinas/1/eventos");
        }
    }
}
