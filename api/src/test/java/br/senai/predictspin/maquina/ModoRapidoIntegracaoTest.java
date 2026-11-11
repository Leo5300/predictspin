package br.senai.predictspin.maquina;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.IntegracaoBase;

class ModoRapidoIntegracaoTest extends IntegracaoBase {

    private final Instant medidoEm = Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(60);

    private String rota() {
        return "/api/v1/maquinas/" + maquinaId + "/modo-rapido";
    }

    private Instant prazoGravado() {
        java.sql.Timestamp ts = jdbc.queryForObject("SELECT modo_rapido_ate FROM maquina WHERE id = ?",
                java.sql.Timestamp.class, maquinaId);
        return ts == null ? null : ts.toInstant();
    }

    @Test
    void operadorLigaPorDoisMinutosEOPrazoFicaNoBanco() throws Exception {
        String operador = tokenDe("OPERADOR");
        Instant antes = Instant.now();

        var resposta = corpo(mvc.perform(comToken(post(rota()), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maquina_id").value(maquinaId))
                .andExpect(jsonPath("$.ativo").value(true)));

        Instant ate = Instant.parse(resposta.get("modo_rapido_ate").asText());
        assertThat(ate).isBetween(antes.plus(Duration.ofSeconds(119)), Instant.now().plus(Duration.ofSeconds(121)));
        assertThat(prazoGravado()).isEqualTo(ate);
    }

    @Test
    void chamarDeNovoRenovaOPrazo() throws Exception {
        String token = tokenDe("OPERADOR");
        jdbc.update("UPDATE maquina SET modo_rapido_ate = now() + interval '10 seconds' WHERE id = ?", maquinaId);

        mvc.perform(comToken(post(rota()), token)).andExpect(status().isOk());

        assertThat(prazoGravado()).isAfter(Instant.now().plusSeconds(100));
    }

    @Test
    void deleteDesligaEConsultaMostraOEstado() throws Exception {
        String token = tokenDe("OPERADOR");
        mvc.perform(comToken(post(rota()), token)).andExpect(status().isOk());
        mvc.perform(comToken(get(rota()), token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));

        mvc.perform(comToken(delete(rota()), token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false))
                .andExpect(jsonPath("$.modo_rapido_ate", nullValue()));

        assertThat(prazoGravado()).isNull();
        mvc.perform(comToken(get(rota()), token)).andExpect(jsonPath("$.ativo").value(false));
    }

    @Test
    void prazoVencidoContaComoDesligado() throws Exception {
        jdbc.update("UPDATE maquina SET modo_rapido_ate = now() - interval '1 second' WHERE id = ?", maquinaId);
        mvc.perform(comToken(get(rota()), tokenDe("OPERADOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false))
                .andExpect(jsonPath("$.modo_rapido_ate", nullValue()));
    }

    @Test
    void semLoginResponde401EMaquinaInexistente404() throws Exception {
        mvc.perform(post(rota())).andExpect(status().isUnauthorized());
        String token = tokenDe("OPERADOR");
        mvc.perform(comToken(post("/api/v1/maquinas/999999/modo-rapido"), token)).andExpect(status().isNotFound());
        mvc.perform(comToken(delete("/api/v1/maquinas/999999/modo-rapido"), token)).andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/modo-rapido"), token)).andExpect(status().isNotFound());
    }

    @Test
    void ingestaoSoTrazOPrazoEnquantoOModoRapidoVale() throws Exception {
        enviarReal(medidoEm)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.modo_rapido_ate").doesNotExist());

        String token = tokenDe("OPERADOR");
        String ate = corpo(mvc.perform(comToken(post(rota()), token))).get("modo_rapido_ate").asText();

        enviarReal(medidoEm.plusSeconds(5))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.modo_rapido_ate").value(ate));
        // reenvio da mesma janela (200) também avisa
        enviarReal(medidoEm.plusSeconds(5))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modo_rapido_ate").value(ate));
        // o simulador da mesma máquina também recebe
        enviarSimulado(medidoEm).andExpect(jsonPath("$.modo_rapido_ate").value(ate));

        mvc.perform(comToken(delete(rota()), token)).andExpect(status().isOk());
        enviarReal(medidoEm.plusSeconds(10))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.modo_rapido_ate").doesNotExist());
    }
}
