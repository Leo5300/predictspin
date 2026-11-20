package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

/** Padrão: tendência e canais da fusão desligados; as rotas dizem "desabilitada por configuração". */
class TendenciaEFusaoDesligadasIntegracaoTest extends AlarmeIntegracaoBase {

    @Test
    void padraoDesabilitaTendenciaECanais() throws Exception {
        String admin = tokenAdmin();
        JsonNode t = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/tendencia?simulado=true"),
                admin)).andExpect(status().isOk()));
        assertThat(t.get("habilitada").asBoolean()).isFalse();
        assertThat(t.get("mensagem").asText()).contains("desabilitada por configuração");
        JsonNode diag = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/ia/diagnostico?simulado=true"), admin)));
        assertThat(diag.get("tendencia_habilitada").asBoolean()).isFalse();
        diag.get("canais").forEach(c -> assertThat(c.get("habilitado").asBoolean()).isFalse());
        assertThat(diag.get("canais")).hasSize(6);
        mvc.perform(comToken(get("/api/v1/maquinas/999999/tendencia"), admin)).andExpect(status().isNotFound());
    }
}

