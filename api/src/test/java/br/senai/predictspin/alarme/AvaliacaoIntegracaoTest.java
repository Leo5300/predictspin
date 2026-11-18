package br.senai.predictspin.alarme;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

class AvaliacaoIntegracaoTest extends AlarmeIntegracaoBase {

    private JsonNode atual(String token) throws Exception {
        return corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/avaliacao?simulado=true"), token))
                .andExpect(status().isOk()));
    }

    private long avaliacoes(int estado) {
        return jdbc.queryForObject("SELECT count(*) FROM avaliacao WHERE estado = ?", Long.class, estado);
    }

    @Test
    void normalDepoisSeveroComAtrasoEExplicacao() throws Exception {
        String token = tokenAdmin();
        // sem referência: nenhuma linha de avaliação
        enviarSequencia(Instant.now().minus(3, ChronoUnit.HOURS), 1, 1120, VAZIO);
        assertThat(contar("avaliacao")).isZero();
        assertThat(atual(token).get("pontos").get(0).get("situacao").asText()).isEqualTo("sem_referencia");

        prepararReferencia(token);
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        t = enviarSequencia(t, 3, 1120, VAZIO);
        t = enviarSequencia(t, 3, 1120, CORTE);
        assertThat(avaliacoes(0)).isEqualTo(18);
        JsonNode normal = atual(token);
        assertThat(normal.get("estado").asText()).isEqualTo("normal");
        assertThat(normal.get("marcha_rpm").asInt()).isEqualTo(1120);
        assertThat(normal.get("referencia_versao").asInt()).isEqualTo(1);
        JsonNode pontoB = normal.get("pontos").get(1);
        assertThat(pontoB.get("ponto").asText()).isEqualTo("B");
        assertThat(pontoB.get("etapa_ref").asText()).isEqualTo("T3");
        assertThat(pontoB.get("medidas").get(0).get("tipico").asDouble()).isBetween(0.19, 0.21);

        // severo: as duas primeiras janelas ainda não acendem nada (atraso de 15 s)
        t = enviarSequencia(t, 2, 1120, SEVERO);
        assertThat(estadoDoPonto("A")).isZero();
        t = enviarSequencia(t, 1, 1120, SEVERO);
        assertThat(estadoDoPonto("A")).isEqualTo(2);
        assertThat(estadoDoPonto("B")).isEqualTo(2);
        JsonNode alarme = atual(token);
        assertThat(alarme.get("estado").asText()).isEqualTo("alarme");
        assertThat(alarme.get("explicacao").asText()).contains("σ acima do típico da marcha 1120");
        assertThat(alarme.get("pontos").get(0).get("z_max").asDouble()).isGreaterThan(5);
        Double severidade = jdbc.queryForObject("SELECT sum(valor) FROM severidade_acumulada WHERE simulado",
                Double.class);
        assertThat(severidade).isPositive();
        // o histórico do dia soma as 3 janelas; o contador que dispara OS só a 3ª (as 2 primeiras estavam no
        // atraso, sem alerta)
        Double desdeOs = jdbc.queryForObject("SELECT sum(severidade_desde_os) FROM estado_ponto", Double.class);
        assertThat(desdeOs).isPositive().isLessThan(severidade);
        assertThat(contar("ordem_servico")).isZero();

        // volta ao normal: sai só depois de 15 s abaixo do limite − histerese
        t = enviarSequencia(t, 2, 1120, VAZIO);
        assertThat(estadoDoPonto("A")).isEqualTo(2);
        enviarSequencia(t, 1, 1120, VAZIO);
        assertThat(estadoDoPonto("A")).isZero();
    }

    @Test
    void janelaRecuperadaNaoMexeNoEstadoEEnsaioDeCondicaoNaoSomaSeveridade() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant agora = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        enviarSequencia(agora, 1, 1120, VAZIO);
        // janela antiga da fila do dispositivo, severa: gravada com o nível bruto, estado intacto
        enviarSequencia(agora.minus(10, ChronoUnit.MINUTES), 1, 1120, SEVERO);
        assertThat(avaliacoes(2)).isEqualTo(3);
        assertThat(estadoDoPonto("A")).isZero();
        assertThat(contar("severidade_acumulada")).isEqualTo(3);
        jdbc.update("DELETE FROM severidade_acumulada");

        long ensaio = abrirEnsaio(token, "T1", "avanco_excessivo", 1120, null);
        enviarSequencia(agora.plusSeconds(5), 4, 1120, SEVERO);
        encerrarEnsaio(token, ensaio);
        // a avaliação e o estado aparecem, mas a severidade não soma
        assertThat(estadoDoPonto("A")).isEqualTo(2);
        assertThat(contar("severidade_acumulada")).isZero();
    }

    @Test
    void pontoAusenteAcendeInstrumentoESemReferenciaCompletaFicaSemEstado() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        for (int i = 0; i < 6; i++) {
            Map<String, Object> p = janela(DISPOSITIVO_SIM, t, 1120, VAZIO[0], VAZIO[1], VAZIO[2]);
            @SuppressWarnings("unchecked")
            Map<String, Object> pontos = (Map<String, Object>) p.get("pontos");
            pontos.remove("C");
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
            t = t.plusSeconds(5);
        }
        assertThat(jdbc.queryForObject("""
                SELECT e.instrumento_ativo FROM estado_ponto e JOIN ponto_medicao pm ON pm.id = e.ponto_medicao_id
                WHERE pm.codigo = 'C' AND e.simulado
                """, Boolean.class)).isTrue();

        // 450 rpm: não há T1 nem T3 nessa marcha (janela sem velocidade, como a do firmware antigo)
        Map<String, Object> semVelocidade = payload(DISPOSITIVO_SIM, t);
        semVelocidade.put("rotacao_rpm", 450.0);
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, semVelocidade).andExpect(status().isCreated());
        JsonNode avaliacao = atual(token);
        assertThat(avaliacao.get("pontos").get(0).get("medidas")).hasSize(6);
        assertThat(avaliacao.get("estado").isNull()).isTrue();
        assertThat(avaliacao.get("pontos").get(0).get("situacao").asText()).isEqualTo("sem_referencia");
        // saturou: não avaliável
        Map<String, Object> saturada = janela(DISPOSITIVO_SIM, t.plusSeconds(5), 1120, 0.1, 0.1, 0.1);
        saturada.put("saturou", true);
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, saturada).andExpect(status().isCreated());
        assertThat(atual(token).get("pontos").get(1).get("situacao").asText()).isEqualTo("nao_avaliavel");
    }

    @Test
    void derivaEntraNoRecalculoEMaquinaInexistente() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, CORTE);
        // um pico isolado nos três pontos: ainda NORMAL (atraso), mas com z de alarme: fica fora da deriva
        t = enviarSequencia(t, 1, 1120, SEVERO);
        // corte mais leve que o típico (z negativo), avaliado NORMAL: entra
        enviarSequencia(t, 1, 1120, new double[] {CORTE[0] * 0.8, CORTE[1] * 0.8, CORTE[2] * 0.8});
        JsonNode versao = recalcular(token);
        assertThat(versao.get("numero").asInt()).isEqualTo(2);
        assertThat(versao.get("janelas_deriva").asInt()).isEqualTo(5);
        mvc.perform(comToken(get("/api/v1/maquinas/999999/avaliacao"), token)).andExpect(status().isNotFound());
        JsonNode real = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/avaliacao"), token)));
        assertThat(real.get("janela_id").isNull()).isTrue();
        assertThat(real.get("pontos")).isEmpty();
    }

    @Test
    void sinalSumidoNumPontoSoAcendeInstrumento() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        // A com sinal quase zero, B e C normais, girando a 1120
        double[] semA = {0.01, VAZIO[1], VAZIO[2]};
        enviarSequencia(t, 6, 1120, semA);
        Map<String, Object> estado = new LinkedHashMap<>(jdbc.queryForMap("""
                SELECT e.instrumento_ativo, e.estado FROM estado_ponto e
                JOIN ponto_medicao pm ON pm.id = e.ponto_medicao_id WHERE pm.codigo = 'A' AND e.simulado
                """));
        assertThat(estado.get("instrumento_ativo")).isEqualTo(true);
        // queda não é desvio para cima: o estado de máquina continua normal
        assertThat(((Number) estado.get("estado")).intValue()).isZero();
    }

    @Test
    void quedaEmDoisPontosNaoEhSensorSoltoEReceitaDoCorteMostraOTipico() throws Exception {
        String token = tokenAdmin();
        Instant inicio = Instant.now().minus(3, ChronoUnit.HOURS);
        gravarEnsaio(token, "T3", "normal", 1120, "aço 1045", 25, inicio, 0.30, 0.40, 0.10);
        prepararReferencia(token);
        // A e B caem juntos: é a máquina parando de cortar, não um sensor solto
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 6, 1120,
                new double[] {0.01, 0.01, VAZIO[2]});
        assertThat(jdbc.queryForObject("SELECT count(*) FROM estado_ponto WHERE instrumento_ativo", Long.class))
                .isZero();
        // dentro de um ensaio T3 com a mesma receita, o típico é o da receita
        long ensaio = abrirEnsaio(token, "T3", "normal", 1120, "aço 1045");
        enviarSequencia(t, 1, 1120, new double[] {0.30, 0.40, 0.10});
        JsonNode avaliacao = atual(token);
        encerrarEnsaio(token, ensaio);
        JsonNode pontoB = avaliacao.get("pontos").get(1);
        assertThat(pontoB.get("generica").asBoolean()).isFalse();
        assertThat(pontoB.get("medidas").get(0).get("tipico").asDouble()).isBetween(0.39, 0.41);
        assertThat(avaliacao.get("estado").asText()).isEqualTo("normal");
    }
}
