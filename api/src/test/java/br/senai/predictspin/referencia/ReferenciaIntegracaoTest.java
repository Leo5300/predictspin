package br.senai.predictspin.referencia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

class ReferenciaIntegracaoTest extends AlarmeIntegracaoBase {

    @Test
    void recalculoGeraVersaoComCelulasECobertura() throws Exception {
        String token = tokenAdmin();
        Instant t = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        t = gravarEnsaio(token, "T0", "normal", 0, null, 25, t, 0.010, 0.012, 0.008);
        t = gravarEnsaio(token, "T1", "normal", 1120, null, 25, t, 0.10, 0.08, 0.04);
        t = gravarEnsaio(token, "T3", "normal", 1120, "aço 1045", 25, t, 0.14, 0.20, 0.06);
        // fica de fora: condição de falha e T2
        t = gravarEnsaio(token, "T1", "avanco_excessivo", 1120, null, 3, t, 0.5, 0.5, 0.5);
        gravarEnsaio(token, "T2", "normal", 1120, null, 2, t, 0.10, 0.08, 0.04);

        JsonNode versao = recalcular(token);
        assertThat(versao.get("numero").asInt()).isEqualTo(1);
        assertThat(versao.get("simulado").asBoolean()).isTrue();
        assertThat(versao.get("janelas_usadas").asInt()).isEqualTo(75);
        assertThat(versao.get("excluidas").get("condicao_nao_normal").asInt()).isEqualTo(3);
        assertThat(versao.get("excluidas").get("etapa_t2").asInt()).isEqualTo(2);
        assertThat(versao.get("autor").asText()).isEqualTo("Admin dos Testes");
        assertThat(versao.get("celulas_suficientes").asInt()).isPositive();

        JsonNode ref = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/referencias?simulado=true"), token)).andExpect(status().isOk()));
        assertThat(ref.get("piso_ruido_medido").asBoolean()).isTrue();
        assertThat(ref.get("versao").get("numero").asInt()).isEqualTo(1);
        JsonNode cobertura = ref.get("cobertura");
        assertThat(cobertura.toString()).contains("{\"marcha_rpm\":0,\"etapa\":\"T0\",\"situacao\":\"com\"}",
                "{\"marcha_rpm\":1120,\"etapa\":\"T1\",\"situacao\":\"com\"}",
                "{\"marcha_rpm\":1120,\"etapa\":\"T3\",\"situacao\":\"com\"}");
        // receita do T3 tem célula própria; T1 do B tem piso medido no T0
        boolean temReceita = false;
        for (JsonNode c : ref.get("celulas")) {
            temReceita |= c.get("por_receita").asBoolean();
            if (c.get("ponto").asText().equals("B") && c.get("etapa").asText().equals("T1")
                    && c.get("medida").asText().equals("rms_g")) {
                assertThat(c.get("piso_ruido").isNull()).isFalse();
                assertThat(c.get("mediana").asDouble()).isBetween(0.079, 0.081);
                assertThat(c.get("n").asInt()).isEqualTo(25);
            }
        }
        assertThat(temReceita).isTrue();

        // a referência real continua vazia: real e simulado nunca se misturam
        JsonNode real = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/referencias"), token)));
        assertThat(real.get("versao").isNull()).isTrue();
        assertThat(real.get("celulas")).isEmpty();
        assertThat(real.get("cobertura").get(0).get("situacao").asText()).isEqualTo("sem");

        // segunda versão: a anterior fica guardada
        recalcular(token);
        JsonNode versoes = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/referencias/versoes?simulado=true&size=1"), token)).andExpect(status().isOk()));
        assertThat(versoes.get("total_elementos").asLong()).isEqualTo(2);
        assertThat(versoes.get("total_paginas").asInt()).isEqualTo(2);
        assertThat(versoes.get("conteudo").get(0).get("numero").asInt()).isEqualTo(2);
        assertThat(referencias.ativa(maquinaId, true).orElseThrow().numero()).isEqualTo(2);
    }

    @Test
    void poucasJanelasFicamInsuficientes() throws Exception {
        String token = tokenDe("TECNICO");
        gravarEnsaio(token, "T1", "normal", 1120, null, 5, Instant.now().minusSeconds(600), 0.1, 0.1, 0.1);
        JsonNode versao = recalcular(token);
        assertThat(versao.get("celulas").asInt()).isPositive();
        assertThat(versao.get("celulas_suficientes").asInt()).isZero();
        JsonNode ref = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/referencias?simulado=true"), token)));
        assertThat(ref.get("piso_ruido_medido").asBoolean()).isFalse();
        assertThat(ref.get("cobertura").toString())
                .contains("{\"marcha_rpm\":1120,\"etapa\":\"T1\",\"situacao\":\"insuficiente\"}");
        assertThat(referencias.ativa(maquinaId, true).orElseThrow()
                .celula(1, Medida.RMS_G, 1120, "T1")).isEmpty();
    }

    @Test
    void operadorNaoRecalculaEMaquinaInexistenteDa404() throws Exception {
        String operador = tokenDe("OPERADOR");
        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/referencias/recalcular"), operador))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/referencias"), operador))
                .andExpect(status().isOk());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/referencias"), operador))
                .andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/referencias/versoes"), operador))
                .andExpect(status().isNotFound());
        assertThat(referencias.ativa(maquinaId, false)).isEmpty();
    }
}
