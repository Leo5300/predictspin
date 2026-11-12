package br.senai.predictspin.maquina;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import br.senai.predictspin.IntegracaoBase;

class PlanoDeColetaIntegracaoTest extends IntegracaoBase {

    private String tecnico;

    @BeforeEach
    void preparar() throws Exception {
        tecnico = tokenDe("TECNICO");
    }

    @AfterEach
    void limparPlano() {
        jdbc.update("UPDATE maquina SET rotacoes_coleta_rpm = '{}'");
    }

    private ResultActions gravarPlano(String token, String corpo) throws Exception {
        return mvc.perform(comToken(put("/api/v1/maquinas/" + maquinaId + "/coleta/plano"), token)
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String rotaCobertura() {
        return "/api/v1/maquinas/" + maquinaId + "/coleta/cobertura";
    }

    @Test
    void maquinaTrazAsRotacoesNominaisDaMigracaoEOPlanoVazio() throws Exception {
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId), tokenDe("OPERADOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codigo").value("TORNO-01"))
                .andExpect(jsonPath("$.local.nome").value("SENAI São Carlos"))
                .andExpect(jsonPath("$.rotacoes_nominais_rpm", contains(45, 71, 90, 112, 140, 180, 224, 265, 280,
                        355, 450, 560, 710, 900, 1120, 1400, 1800, 2240)))
                .andExpect(jsonPath("$.rotacoes_coleta_rpm", hasSize(0)));

        mvc.perform(comToken(get("/api/v1/maquinas"), tecnico))
                .andExpect(jsonPath("$.conteudo[0].rotacoes_nominais_rpm", hasSize(18)))
                .andExpect(jsonPath("$.conteudo[0].rotacoes_coleta_rpm", hasSize(0)));
        mvc.perform(comToken(get("/api/v1/maquinas/999999"), tecnico)).andExpect(status().isNotFound());
    }

    @Test
    void tecnicoGravaOPlanoOrdenadoESemRepeticao() throws Exception {
        gravarPlano(tecnico, "{\"rotacoes_rpm\":[1120,280,560,280]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rotacoes_coleta_rpm", contains(280, 560, 1120)))
                .andExpect(jsonPath("$.rotacoes_nominais_rpm", hasItem(265)));

        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId), tecnico))
                .andExpect(jsonPath("$.rotacoes_coleta_rpm", contains(280, 560, 1120)));

        // lista vazia limpa o plano
        gravarPlano(tokenAdmin(), "{\"rotacoes_rpm\":[]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rotacoes_coleta_rpm", hasSize(0)));
    }

    @Test
    void planoInvalidoResponde400EOperadorNaoGrava() throws Exception {
        gravarPlano(tecnico, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("rotacoes_rpm"));
        gravarPlano(tecnico, "{\"rotacoes_rpm\":[-1]}").andExpect(status().isBadRequest());
        gravarPlano(tecnico, "{\"rotacoes_rpm\":[30001]}").andExpect(status().isBadRequest());
        gravarPlano(tecnico, "{\"rotacoes_rpm\":[280,null]}").andExpect(status().isBadRequest());

        gravarPlano(tokenDe("OPERADOR"), "{\"rotacoes_rpm\":[280]}").andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/maquinas/" + maquinaId + "/coleta/plano")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rotacoes_rpm\":[280]}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(comToken(put("/api/v1/maquinas/999999/coleta/plano"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rotacoes_rpm\":[280]}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void coberturaUsaOPlanoEVoltaAsRotacoesUsadasQuandoEleEstaVazio() throws Exception {
        // um ensaio válido a 900 rpm: é a única rotação "já usada"
        long ensaioId = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":900,\"simulado\":true}"))
                .andExpect(status().isCreated())).get("id").asLong();
        enviarSimulado(Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(30)).andExpect(status().isCreated());
        mvc.perform(comToken(post("/api/v1/ensaios/" + ensaioId + "/encerrar"), tecnico)).andExpect(status().isOk());

        mvc.perform(comToken(get(rotaCobertura() + "?simulado=true"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.origem_rotacoes").value("usadas"))
                .andExpect(jsonPath("$.rotacoes_rpm", contains(900)));

        gravarPlano(tecnico, "{\"rotacoes_rpm\":[560,900]}").andExpect(status().isOk());
        mvc.perform(comToken(get(rotaCobertura() + "?simulado=true"), tecnico))
                .andExpect(jsonPath("$.origem_rotacoes").value("plano"))
                .andExpect(jsonPath("$.rotacoes_rpm", contains(560, 900)))
                .andExpect(jsonPath("$.ensaios_validos").value(1));

        // o parâmetro continua valendo acima do plano
        mvc.perform(comToken(get(rotaCobertura() + "?simulado=true&rotacoes=1400"), tecnico))
                .andExpect(jsonPath("$.origem_rotacoes").value("parametro"))
                .andExpect(jsonPath("$.rotacoes_rpm", contains(1400)));
    }
}
