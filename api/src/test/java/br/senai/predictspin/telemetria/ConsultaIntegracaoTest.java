package br.senai.predictspin.telemetria;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import br.senai.predictspin.IntegracaoBase;

class ConsultaIntegracaoTest extends IntegracaoBase {

    private String operador;
    private Instant base;

    @BeforeEach
    void preparar() throws Exception {
        operador = tokenDe("OPERADOR");
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(10, ChronoUnit.MINUTES);
    }

    private Long pontoId(String codigo) {
        return jdbc.queryForObject("SELECT id FROM ponto_medicao WHERE maquina_id = ? AND codigo = ?", Long.class,
                maquinaId, codigo);
    }

    @Test
    void listaMaquinasComLocal() throws Exception {
        mvc.perform(comToken(get("/api/v1/maquinas"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(1))
                .andExpect(jsonPath("$.conteudo[0].codigo").value("TORNO-01"))
                .andExpect(jsonPath("$.conteudo[0].classe").value("torno"))
                .andExpect(jsonPath("$.conteudo[0].modelo").value("ROMI Tormax 30"))
                .andExpect(jsonPath("$.conteudo[0].local.nome").value("SENAI São Carlos"))
                .andExpect(jsonPath("$.conteudo[0].local.uf").value("SP"));
    }

    @Test
    void listaPontosPaginadoComPapel() throws Exception {
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/pontos?size=2"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(3))
                .andExpect(jsonPath("$.total_paginas").value(2))
                .andExpect(jsonPath("$.conteudo[0].codigo").value("A"))
                .andExpect(jsonPath("$.conteudo[0].papel").value("acionamento"))
                .andExpect(jsonPath("$.conteudo[0].descricao").value("Cabeçote"))
                .andExpect(jsonPath("$.conteudo[1].papel").value("ferramenta"));
        mvc.perform(comToken(get("/api/v1/maquinas/999999/pontos"), operador)).andExpect(status().isNotFound());
    }

    @Test
    void listaDispositivosComUltimoContatoEFiltroSimulado() throws Exception {
        enviarSimulado(base).andExpect(status().isCreated());

        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/dispositivos"), operador))
                .andExpect(jsonPath("$.total_elementos").value(2))
                .andExpect(jsonPath("$.conteudo[0].credencial_hash").doesNotExist());
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/dispositivos?simulado=true"), operador))
                .andExpect(jsonPath("$.total_elementos").value(1))
                .andExpect(jsonPath("$.conteudo[0].identificador").value(DISPOSITIVO_SIM))
                .andExpect(jsonPath("$.conteudo[0].ultimo_contato").isNotEmpty());
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/dispositivos?simulado=false"), operador))
                .andExpect(jsonPath("$.conteudo[0].identificador").value(DISPOSITIVO_REAL))
                .andExpect(jsonPath("$.conteudo[0].ultimo_contato", nullValue()));
    }

    @Test
    void serieDoPontoEhPaginadaOrdenadaEFiltrada() throws Exception {
        for (int i = 0; i < 5; i++) {
            enviarSimulado(base.plusSeconds(5L * i)).andExpect(status().isCreated());
        }
        enviarReal(base).andExpect(status().isCreated());
        Long pontoB = pontoId("B");

        mvc.perform(comToken(get("/api/v1/pontos/" + pontoB + "/telemetria?size=2&simulado=true"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(5))
                .andExpect(jsonPath("$.total_paginas").value(3))
                .andExpect(jsonPath("$.conteudo.length()").value(2))
                .andExpect(jsonPath("$.conteudo[0].medido_em").value(base.plusSeconds(20).toString()))
                .andExpect(jsonPath("$.conteudo[0].rms_g").value(0.2))
                .andExpect(jsonPath("$.conteudo[0].o1x").isNumber())
                .andExpect(jsonPath("$.conteudo[0].dispositivo").value(DISPOSITIVO_SIM));
        mvc.perform(comToken(get("/api/v1/pontos/" + pontoB + "/telemetria"), operador))
                .andExpect(jsonPath("$.total_elementos").value(6));
        mvc.perform(comToken(get("/api/v1/pontos/" + pontoB + "/telemetria?simulado=false"), operador))
                .andExpect(jsonPath("$.total_elementos").value(1));
        // período: só as duas primeiras janelas simuladas (de inclusivo, ate exclusivo)
        mvc.perform(comToken(get("/api/v1/pontos/" + pontoB + "/telemetria?simulado=true&de=" + base
                        + "&ate=" + base.plusSeconds(10)), operador))
                .andExpect(jsonPath("$.total_elementos").value(2));
    }

    @Test
    void serieComPeriodoInvalidoOuPontoInexistente() throws Exception {
        mvc.perform(comToken(get("/api/v1/pontos/" + pontoId("A") + "/telemetria?de=" + base + "&ate=" + base),
                        operador))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/v1/pontos/" + pontoId("A") + "/telemetria?de=ontem"), operador))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/v1/pontos/999999/telemetria"), operador)).andExpect(status().isNotFound());
    }

    @Test
    void ultimaJanelaTrazPontosCanaisRotacaoEIdade() throws Exception {
        enviarReal(base).andExpect(status().isCreated());
        var maisRecente = payload(DISPOSITIVO_REAL, base.plusSeconds(5));
        maisRecente.put("rotacao_rpm", 1350.0);
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, maisRecente).andExpect(status().isCreated());

        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.medido_em").value(base.plusSeconds(5).toString()))
                .andExpect(jsonPath("$.rotacao_rpm").value(1350.0))
                .andExpect(jsonPath("$.dispositivo").value(DISPOSITIVO_REAL))
                .andExpect(jsonPath("$.segundos_desde_recebimento", greaterThanOrEqualTo(0)))
                .andExpect(jsonPath("$.pontos.A.papel").value("acionamento"))
                .andExpect(jsonPath("$.pontos.B.rms_g").value(0.2))
                .andExpect(jsonPath("$.pontos.C.o3x").isNumber())
                .andExpect(jsonPath("$.canais.corrente_a.valor").value(4.2))
                .andExpect(jsonPath("$.canais.corrente_a.unidade").value("A"))
                .andExpect(jsonPath("$.canais.amb_umid_pct.grandeza").value("umidade"));
    }

    @Test
    void ultimaJanelaRespeitaFiltroSimuladoE404SemDados() throws Exception {
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela"), operador))
                .andExpect(status().isNotFound());
        enviarSimulado(base).andExpect(status().isCreated());
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela?simulado=true"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.simulado").value(true));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ultima-janela?simulado=false"), operador))
                .andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/ultima-janela"), operador)).andExpect(status().isNotFound());
    }
}
