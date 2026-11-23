package br.senai.predictspin.push;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Chamada ao serviço de push do Expo (https://exp.host/--/api/v2/push/send): um lote de mensagens por chamada,
 * tempo limite curto e no máximo uma nova tentativa (rede, 429 ou 5xx). A resposta traz um "ticket" por
 * mensagem, na mesma ordem. O token de acesso (EXPO_ACCESS_TOKEN) só vai no cabeçalho quando configurado e
 * nunca aparece em log.
 */
@Component
class ClienteExpo {

    private static final Logger LOG = LoggerFactory.getLogger(ClienteExpo.class);

    /** Resultado de uma mensagem. */
    enum Resultado {
        ACEITA, NAO_REGISTRADO, RECUSADA
    }

    /** Mensagem já pronta para o Expo. */
    record Mensagem(String token, String titulo, String corpo, Map<String, Object> dados) {
    }

    private final PropriedadesPush prop;
    private final ObjectMapper json;
    private final HttpClient http;

    ClienteExpo(PropriedadesPush prop, ObjectMapper json) {
        this.prop = prop;
        this.json = json;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(prop.timeoutMs())).build();
    }

    /** Envia um lote (até ps.push.lote mensagens); devolve um resultado por mensagem, na mesma ordem. */
    List<Resultado> enviar(List<Mensagem> lote) {
        String corpo;
        try {
            corpo = json.writeValueAsString(lote.stream().map(ClienteExpo::paraExpo).toList());
        } catch (IOException e) {
            throw new IllegalStateException("mensagem de push inválida", e);
        }
        for (int tentativa = 1; tentativa <= 2; tentativa++) {
            try {
                HttpResponse<String> resposta = http.send(pedido(corpo), HttpResponse.BodyHandlers.ofString());
                int status = resposta.statusCode();
                if (status == 200) {
                    return lerTickets(resposta.body(), lote.size());
                }
                LOG.warn("Push: o Expo respondeu {} (tentativa {} de 2)", status, tentativa);
                if (status != 429 && status < 500) {
                    break; // pedido recusado: tentar de novo daria o mesmo
                }
            } catch (IOException e) {
                LOG.warn("Push: falha ao chamar o Expo (tentativa {} de 2): {}", tentativa, e.getClass().getSimpleName());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return Collections.nCopies(lote.size(), Resultado.RECUSADA);
    }

    private HttpRequest pedido(String corpo) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(prop.url()))
                .timeout(Duration.ofMillis(prop.timeoutMs()))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(corpo));
        if (prop.tokenAcesso() != null && !prop.tokenAcesso().isBlank()) {
            b.header("Authorization", "Bearer " + prop.tokenAcesso().trim());
        }
        return b.build();
    }

    private List<Resultado> lerTickets(String corpo, int n) throws IOException {
        JsonNode dados = json.readTree(corpo).path("data");
        List<Resultado> resultados = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            JsonNode t = dados.path(i);
            if ("ok".equals(t.path("status").asText())) {
                resultados.add(Resultado.ACEITA);
            } else if ("DeviceNotRegistered".equals(t.path("details").path("error").asText())) {
                resultados.add(Resultado.NAO_REGISTRADO);
            } else {
                resultados.add(Resultado.RECUSADA);
            }
        }
        return resultados;
    }

    /** Campos no formato do Expo (camelCase): o ObjectMapper da API usa snake_case, então vai como mapa. */
    private static Map<String, Object> paraExpo(Mensagem m) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("to", m.token());
        e.put("title", m.titulo());
        e.put("body", m.corpo());
        e.put("data", m.dados());
        e.put("channelId", PushService.CANAL_ANDROID);
        e.put("priority", "high");
        e.put("sound", "default");
        return e;
    }
}
