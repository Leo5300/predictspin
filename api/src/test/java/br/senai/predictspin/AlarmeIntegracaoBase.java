package br.senai.predictspin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

/** Utilidades dos testes de referência, avaliação, alertas e OS: ensaios e janelas sob medida. */
public abstract class AlarmeIntegracaoBase extends IntegracaoBase {

    /** Medidas de um ponto a partir do RMS (as outras proporcionais), com velocidade. */
    protected static Map<String, Object> medidaCom(double rms) {
        Map<String, Object> m = medida(rms);
        m.put("vel_rms_mm_s", rms * 10);
        return m;
    }

    /** Payload com a rotação e o RMS de cada ponto dados. */
    protected static Map<String, Object> janela(String dispositivo, Instant medidoEm, double rpm, double rmsA,
                                                double rmsB, double rmsC) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("dispositivo", dispositivo);
        p.put("medido_em", medidoEm.toString());
        p.put("rotacao_rpm", rpm);
        p.put("saturou", false);
        Map<String, Object> pontos = new LinkedHashMap<>();
        pontos.put("A", medidaCom(rmsA));
        pontos.put("B", medidaCom(rmsB));
        pontos.put("C", medidaCom(rmsC));
        p.put("pontos", pontos);
        return p;
    }

    protected JsonNode enviarSim(Map<String, Object> payload) throws Exception {
        return corpo(enviar(DISPOSITIVO_SIM, CHAVE_SIM, payload));
    }

    protected long abrirEnsaio(String token, String etapa, String condicao, int rpm, String material)
            throws Exception {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("etapa", etapa);
        req.put("condicao", condicao);
        req.put("rotacao_alvo_rpm", rpm);
        req.put("simulado", true);
        if (material != null) {
            req.put("material", material);
        }
        String resposta = mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), token)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(req)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(resposta).get("id").asLong();
    }

    protected void encerrarEnsaio(String token, long ensaioId) throws Exception {
        mvc.perform(comToken(post("/api/v1/ensaios/" + ensaioId + "/encerrar"), token)).andExpect(status().isOk());
    }

    /**
     * Grava um ensaio simulado com {@code n} janelas de 5 s a partir de {@code inicio}; o RMS de cada
     * ponto oscila ±2% em torno do dado. Devolve o instante seguinte ao da última janela.
     */
    protected Instant gravarEnsaio(String token, String etapa, String condicao, int rpm, String material, int n,
                                   Instant inicio, double rmsA, double rmsB, double rmsC) throws Exception {
        long ensaio = abrirEnsaio(token, etapa, condicao, rpm, material);
        Instant t = inicio;
        for (int i = 0; i < n; i++) {
            double f = 1 + 0.01 * ((i % 5) - 2);
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, janela(DISPOSITIVO_SIM, t, rpm, rmsA * f, rmsB * f, rmsC * f))
                    .andExpect(status().isCreated());
            t = t.plusSeconds(5);
        }
        encerrarEnsaio(token, ensaio);
        return t;
    }

    protected JsonNode recalcular(String token) throws Exception {
        return corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId
                + "/referencias/recalcular?simulado=true"), token)).andExpect(status().isCreated()));
    }
}
