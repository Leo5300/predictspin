package br.senai.predictspin.ia;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import br.senai.predictspin.ia.dto.SegundaOpiniaoResposta;

/** Lê a segunda opinião guardada em JSON no alerta e na OS (gravada com os nomes em snake_case da API). */
public final class OpiniaoJson {

    private static final ObjectMapper LEITOR = new ObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .registerModule(new JavaTimeModule())
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private OpiniaoJson() {
    }

    /** Nulo quando não há opinião (sem modelo ativo) ou o JSON não pode ser lido. */
    public static SegundaOpiniaoResposta ler(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return LEITOR.readValue(json, SegundaOpiniaoResposta.class);
        } catch (Exception e) {
            return null;
        }
    }
}
