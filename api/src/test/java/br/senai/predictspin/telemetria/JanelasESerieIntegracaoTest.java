package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import jakarta.persistence.EntityManagerFactory;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.IntegracaoBase;

class JanelasESerieIntegracaoTest extends IntegracaoBase {

    @Autowired
    private EntityManagerFactory fabrica;

    private String operador;
    private Instant base;

    @BeforeEach
    void preparar() throws Exception {
        operador = tokenDe("OPERADOR");
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(20, ChronoUnit.MINUTES);
    }

    private String rotaJanelas() {
        return "/api/v1/maquinas/" + maquinaId + "/janelas";
    }

    private String rotaSerie() {
        return "/api/v1/maquinas/" + maquinaId + "/serie";
    }

    private Map<String, Object> rapida(String dispositivo, Instant medidoEm) {
        Map<String, Object> p = payload(dispositivo, medidoEm);
        p.put("modo", "rapido");
        p.put("amostras", 1590);
        p.put("amostras_esperadas", 1600);
        return p;
    }

    // ------------------------------------------------------------------ janelas completas

    @Test
    void listaJanelasCompletasComPontosCanaisEMarcas() throws Exception {
        enviarSimulado(base).andExpect(status().isCreated());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, rapida(DISPOSITIVO_SIM, base.plusSeconds(5))).andExpect(status().isCreated());
        enviarReal(base.plusSeconds(10)).andExpect(status().isCreated());

        mvc.perform(comToken(get(rotaJanelas() + "?simulado=true"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(2))
                // mais recente primeiro por padrão
                .andExpect(jsonPath("$.conteudo[0].medido_em").value(base.plusSeconds(5).toString()))
                .andExpect(jsonPath("$.conteudo[0].modo").value("rapido"))
                .andExpect(jsonPath("$.conteudo[0].amostras").value(1590))
                .andExpect(jsonPath("$.conteudo[0].amostras_esperadas").value(1600))
                .andExpect(jsonPath("$.conteudo[0].simulado").value(true))
                .andExpect(jsonPath("$.conteudo[0].dispositivo").value(DISPOSITIVO_SIM))
                .andExpect(jsonPath("$.conteudo[0].ensaio_id", nullValue()))
                .andExpect(jsonPath("$.conteudo[0].pontos.A.rms_g").value(0.10))
                .andExpect(jsonPath("$.conteudo[0].pontos.A.papel").value("acionamento"))
                .andExpect(jsonPath("$.conteudo[0].pontos.B.pico_g", closeTo(0.60, 1e-9)))
                .andExpect(jsonPath("$.conteudo[0].pontos.C.o1x", closeTo(0.03, 1e-9)))
                .andExpect(jsonPath("$.conteudo[0].canais.corrente_a.valor").value(4.2))
                .andExpect(jsonPath("$.conteudo[0].canais.corrente_a.unidade").value("A"))
                .andExpect(jsonPath("$.conteudo[1].modo").value("normal"))
                .andExpect(jsonPath("$.conteudo[1].amostras", nullValue()));

        mvc.perform(comToken(get(rotaJanelas() + "?simulado=false"), operador))
                .andExpect(jsonPath("$.total_elementos").value(1))
                .andExpect(jsonPath("$.conteudo[0].dispositivo").value(DISPOSITIVO_REAL))
                .andExpect(jsonPath("$.conteudo[0].simulado").value(false));
    }

    @Test
    void filtraPorModoPeriodoEOrdenaEPagina() throws Exception {
        for (int i = 0; i < 5; i++) {
            enviarSimulado(base.plusSeconds(5L * i)).andExpect(status().isCreated());
        }
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, rapida(DISPOSITIVO_SIM, base.plusSeconds(60))).andExpect(status().isCreated());

        mvc.perform(comToken(get(rotaJanelas() + "?modo=normal&ordem=asc&size=2&page=1"), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(5))
                .andExpect(jsonPath("$.total_paginas").value(3))
                .andExpect(jsonPath("$.pagina").value(1))
                .andExpect(jsonPath("$.conteudo", hasSize(2)))
                .andExpect(jsonPath("$.conteudo[0].medido_em").value(base.plusSeconds(10).toString()))
                .andExpect(jsonPath("$.conteudo[1].medido_em").value(base.plusSeconds(15).toString()));

        mvc.perform(comToken(get(rotaJanelas() + "?modo=rapido"), operador))
                .andExpect(jsonPath("$.total_elementos").value(1));

        // "de" inclusivo, "ate" exclusivo
        mvc.perform(comToken(get(rotaJanelas() + "?de=" + base.plusSeconds(5) + "&ate=" + base.plusSeconds(15)), operador))
                .andExpect(jsonPath("$.total_elementos").value(2));
    }

    @Test
    void entradasInvalidasEMaquinaInexistente() throws Exception {
        mvc.perform(comToken(get(rotaJanelas() + "?modo=turbo"), operador)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get(rotaJanelas() + "?ordem=lado"), operador)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get(rotaJanelas() + "?size=201"), operador)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get(rotaJanelas() + "?de=" + base + "&ate=" + base.minusSeconds(1)), operador))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/janelas"), operador)).andExpect(status().isNotFound());
        mvc.perform(get(rotaJanelas())).andExpect(status().isUnauthorized());
    }

    @Test
    void numeroDeConsultasNaoCresceComOTamanhoDaPagina() throws Exception {
        Statistics estatisticas = fabrica.unwrap(SessionFactory.class).getStatistics();
        for (int i = 0; i < 3; i++) {
            enviarSimulado(base.plusSeconds(5L * i)).andExpect(status().isCreated());
        }
        estatisticas.clear();
        mvc.perform(comToken(get(rotaJanelas() + "?size=100"), operador))
                .andExpect(jsonPath("$.conteudo", hasSize(3)));
        long comTres = estatisticas.getPrepareStatementCount();

        for (int i = 3; i < 40; i++) {
            enviarSimulado(base.plusSeconds(5L * i)).andExpect(status().isCreated());
        }
        estatisticas.clear();
        mvc.perform(comToken(get(rotaJanelas() + "?size=100"), operador))
                .andExpect(jsonPath("$.conteudo", hasSize(40)))
                .andExpect(jsonPath("$.conteudo[39].pontos.C.rms_g").value(0.05));
        long comQuarenta = estatisticas.getPrepareStatementCount();

        // máquina, janelas, telemetrias e leituras; com página cheia entra a contagem
        assertThat(comQuarenta).isEqualTo(comTres).isLessThanOrEqualTo(5);
    }

    // ------------------------------------------------------------------ janelas do ensaio

    @Test
    void janelasDoEnsaioVemEmOrdemCrescenteESoAsDele() throws Exception {
        String tecnico = tokenDe("TECNICO");
        enviarSimulado(base).andExpect(status().isCreated());
        JsonNode ensaio = corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":900,\"simulado\":true}"))
                .andExpect(status().isCreated()));
        long ensaioId = ensaio.get("id").asLong();
        enviarSimulado(base.plusSeconds(15)).andExpect(status().isCreated());
        enviarSimulado(base.plusSeconds(5)).andExpect(status().isCreated());
        enviarSimulado(base.plusSeconds(10)).andExpect(status().isCreated());

        mvc.perform(comToken(get("/api/v1/ensaios/" + ensaioId + "/janelas?size=2"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(3))
                .andExpect(jsonPath("$.total_paginas").value(2))
                .andExpect(jsonPath("$.conteudo[0].medido_em").value(base.plusSeconds(5).toString()))
                .andExpect(jsonPath("$.conteudo[1].medido_em").value(base.plusSeconds(10).toString()))
                .andExpect(jsonPath("$.conteudo[0].ensaio_id").value(ensaioId))
                .andExpect(jsonPath("$.conteudo[0].ensaio_codigo").value(ensaio.get("codigo").asText()))
                .andExpect(jsonPath("$.conteudo[0].pontos.A.rms_g").value(0.10));

        mvc.perform(comToken(get("/api/v1/ensaios/999999/janelas"), tecnico)).andExpect(status().isNotFound());
        // rota de ensaio: OPERADOR não acessa
        mvc.perform(comToken(get("/api/v1/ensaios/" + ensaioId + "/janelas"), operador))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------ série agregada

    @Test
    void serieAgregaPorIntervaloEPontoEDeixaLacunaVazia() throws Exception {
        // 4 intervalos de 60 s; janelas no 1º e no 3º; o 2º e o 4º ficam vazios
        Map<String, Object> forte = payload(DISPOSITIVO_SIM, base.plusSeconds(10));
        forte.put("pontos", Map.of("A", medida(0.30), "B", medida(0.20), "C", medida(0.05)));
        forte.put("rotacao_rpm", 1000.0);
        enviarSimulado(base).andExpect(status().isCreated());
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, forte).andExpect(status().isCreated());
        Map<String, Object> saturada = payload(DISPOSITIVO_SIM, base.plusSeconds(130));
        saturada.put("saturou", true);
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, saturada).andExpect(status().isCreated());
        // fica fora: janela rápida e janela de dispositivo real
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, rapida(DISPOSITIVO_SIM, base.plusSeconds(70))).andExpect(status().isCreated());
        enviarReal(base.plusSeconds(75)).andExpect(status().isCreated());

        String consulta = "?simulado=true&baldes=4&de=" + base + "&ate=" + base.plusSeconds(240);
        mvc.perform(comToken(get(rotaSerie() + consulta), operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maquina_id").value(maquinaId))
                .andExpect(jsonPath("$.baldes").value(4))
                .andExpect(jsonPath("$.segundos_por_balde").value(60.0))
                .andExpect(jsonPath("$.pontos", hasSize(3)))
                .andExpect(jsonPath("$.intervalos", hasSize(4)))
                .andExpect(jsonPath("$.intervalos[0].inicio").value(base.toString()))
                .andExpect(jsonPath("$.intervalos[0].fim").value(base.plusSeconds(60).toString()))
                .andExpect(jsonPath("$.intervalos[0].janelas").value(2))
                .andExpect(jsonPath("$.intervalos[0].rotacao_media_rpm").value(1100.0))
                .andExpect(jsonPath("$.intervalos[0].saturou").value(false))
                .andExpect(jsonPath("$.intervalos[0].pontos.A.rms_media_g", closeTo(0.20, 1e-9)))
                .andExpect(jsonPath("$.intervalos[0].pontos.A.rms_max_g", closeTo(0.30, 1e-9)))
                .andExpect(jsonPath("$.intervalos[0].pontos.A.pico_max_g", closeTo(0.90, 1e-9)))
                .andExpect(jsonPath("$.intervalos[0].pontos.A.curtose_media", closeTo(3.0, 1e-9)))
                .andExpect(jsonPath("$.intervalos[0].pontos.A.o1x_media", closeTo(0.12, 1e-9)))
                .andExpect(jsonPath("$.intervalos[0].pontos.B.rms_media_g", closeTo(0.20, 1e-9)))
                // lacuna: só a janela rápida e a real caíram aqui, e nenhuma delas conta
                .andExpect(jsonPath("$.intervalos[1].janelas").value(0))
                .andExpect(jsonPath("$.intervalos[1].rotacao_media_rpm", nullValue()))
                .andExpect(jsonPath("$.intervalos[1].pontos").isEmpty())
                .andExpect(jsonPath("$.intervalos[2].janelas").value(1))
                .andExpect(jsonPath("$.intervalos[2].saturou").value(true))
                .andExpect(jsonPath("$.intervalos[3].janelas").value(0));

        // sem filtro de fonte, a janela real entra no 2º intervalo
        mvc.perform(comToken(get(rotaSerie() + "?baldes=4&de=" + base + "&ate=" + base.plusSeconds(240)), operador))
                .andExpect(jsonPath("$.intervalos[1].janelas").value(1));
    }

    @Test
    void serieUsaUmaConsultaSoParaAgregarERecusaEntradasInvalidas() throws Exception {
        for (int i = 0; i < 30; i++) {
            enviarSimulado(base.plusSeconds(5L * i)).andExpect(status().isCreated());
        }
        Statistics estatisticas = fabrica.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        mvc.perform(comToken(get(rotaSerie() + "?baldes=600&simulado=true&de=" + base + "&ate=" + base.plusSeconds(600)),
                        operador))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intervalos", hasSize(600)));
        // pelo Hibernate só passa a conferência da máquina; a agregação é uma consulta JDBC
        assertThat(estatisticas.getPrepareStatementCount()).isEqualTo(1);

        mvc.perform(comToken(get(rotaSerie() + "?baldes=601"), operador)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get(rotaSerie() + "?baldes=0"), operador)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get(rotaSerie() + "?de=" + base + "&ate=" + base), operador))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(get(rotaSerie() + "?de=" + base.minus(40, ChronoUnit.DAYS) + "&ate=" + base), operador))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/serie"), operador)).andExpect(status().isNotFound());
        mvc.perform(get(rotaSerie())).andExpect(status().isUnauthorized());
    }

    @Test
    void serieSemPeriodoCobreAsUltimas24Horas() throws Exception {
        enviarSimulado(base).andExpect(status().isCreated());
        JsonNode serie = corpo(mvc.perform(comToken(get(rotaSerie() + "?baldes=24"), operador))
                .andExpect(status().isOk()));
        assertThat(serie.get("segundos_por_balde").asDouble()).isEqualTo(3600.0);
        long comJanela = 0;
        for (JsonNode intervalo : serie.get("intervalos")) {
            comJanela += intervalo.get("janelas").asLong();
        }
        assertThat(comJanela).isEqualTo(1);
    }
}
