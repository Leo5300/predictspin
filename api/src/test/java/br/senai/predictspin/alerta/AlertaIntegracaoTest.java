package br.senai.predictspin.alerta;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

class AlertaIntegracaoTest extends AlarmeIntegracaoBase {

    /** A em ATENÇÃO (z ≈ 4 no 1X contra o corte); B e C em corte normal. */
    private static final double[] A_ATENCAO = {0.168, CORTE[1], CORTE[2]};
    private static final double[] A_ALARME = {0.30, CORTE[1], CORTE[2]};

    @Autowired
    private AlertaService alertas;

    private JsonNode listar(String token, String filtro) throws Exception {
        return corpo(mvc.perform(comToken(get("/api/v1/alertas?simulado=true" + filtro), token))
                .andExpect(status().isOk()));
    }

    private JsonNode acao(String token, long id, String acao, Object corpo, int esperado) throws Exception {
        var req = comToken(post("/api/v1/alertas/" + id + "/" + acao), token);
        if (corpo != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(corpo));
        }
        return corpo(mvc.perform(req).andExpect(status().is(esperado)));
    }

    @Test
    void abreUmPorPontoPioraReconheceENormaliza() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        t = enviarSequencia(t, 2, 1120, A_ATENCAO);
        assertThat(contar("alerta")).isZero();
        t = enviarSequencia(t, 3, 1120, A_ATENCAO);
        JsonNode lista = listar(token, "");
        assertThat(lista.get("total_elementos").asLong()).isEqualTo(1);
        JsonNode a = lista.get("conteudo").get(0);
        long id = a.get("id").asLong();
        assertThat(a.get("ponto").asText()).isEqualTo("A");
        assertThat(a.get("tipo").asText()).isEqualTo("maquina");
        assertThat(a.get("nivel").asText()).isEqualTo("atencao");
        assertThat(a.get("prioridade").asText()).isEqualTo("baixa");
        assertThat(a.get("estado").asText()).isEqualTo("ativo_nao_reconhecido");
        assertThat(a.get("componente").asText()).isEqualTo("eixo-árvore e mancal dianteiro");
        assertThat(a.get("referencia_versao").asInt()).isEqualTo(1);
        assertThat(a.get("acao_recomendada").asText()).isNotBlank();
        // só o A saiu do normal: a explicação lembra de conferir a fixação do sensor
        assertThat(a.get("explicacao").asText()).contains("A·").endsWith("confira também a fixação do sensor.");

        // piora: o mesmo alerta sobe para ALARME
        t = enviarSequencia(t, 3, 1120, A_ALARME);
        JsonNode piorou = corpo(mvc.perform(comToken(get("/api/v1/alertas/" + id), token)));
        assertThat(contar("alerta")).isEqualTo(1);
        assertThat(piorou.get("alerta").get("nivel").asText()).isEqualTo("alarme");
        assertThat(piorou.get("alerta").get("pior_nivel").asText()).isEqualTo("alarme");
        assertThat(piorou.get("alerta").get("prioridade").asText()).isEqualTo("alta");
        assertThat(piorou.get("historico").get(0).get("acao").asText()).isEqualTo("abriu");
        assertThat(piorou.get("historico").get(1).get("acao").asText()).isEqualTo("piorou");

        // reconhecer não apaga; segunda vez é conflito
        String operador = tokenDe("OPERADOR");
        assertThat(acao(operador, id, "reconhecer", null, 200).get("estado").asText()).isEqualTo("ativo_reconhecido");
        acao(operador, id, "reconhecer", null, 409);

        // volta ao normal: reconhecido encerra
        enviarSequencia(t, 3, 1120, CORTE);
        JsonNode fim = acao(token, id, "reconhecer", null, 409);
        assertThat(fim.get("mensagem").asText()).contains("já foi reconhecido");
        JsonNode encerrado = corpo(mvc.perform(comToken(get("/api/v1/alertas/" + id), token)));
        assertThat(encerrado.get("alerta").get("estado").asText()).isEqualTo("encerrado");
        assertThat(encerrado.get("alerta").get("reconhecido_por").asText()).startsWith("Usuário OPERADOR");
        assertThat(encerrado.get("alerta").get("normalizado_em").isNull()).isFalse();
    }

    @Test
    void normalizadoSemReconhecerEncerraAoReconhecerEFiltros() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 3, 1120, SEVERO);
        assertThat(listar(token, "&estado=ativo_nao_reconhecido").get("total_elementos").asLong()).isEqualTo(3);
        assertThat(listar(token, "&ponto=B&prioridade=alta").get("total_elementos").asLong()).isEqualTo(1);
        assertThat(listar(token, "&tipo=instrumento").get("total_elementos").asLong()).isZero();
        assertThat(listar(token, "&maquina_id=" + maquinaId + "&de=" + t.minusSeconds(60) + "&ate=" + t.plusSeconds(60))
                .get("total_elementos").asLong()).isEqualTo(3);
        mvc.perform(comToken(get("/api/v1/alertas?prioridade=media"), token)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/v1/alertas?tipo=outro"), token)).andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/v1/alertas/999999"), token)).andExpect(status().isNotFound());
        acao(token, 999999, "reconhecer", null, 404);

        enviarSequencia(t, 3, 1120, VAZIO);
        JsonNode normalizados = listar(token, "&estado=normalizado_nao_reconhecido");
        assertThat(normalizados.get("total_elementos").asLong()).isEqualTo(3);
        long id = normalizados.get("conteudo").get(0).get("id").asLong();
        assertThat(acao(token, id, "reconhecer", null, 200).get("estado").asText()).isEqualTo("encerrado");
        // só ADMIN suprime; alerta já normalizado não é suprimido
        acao(tokenDe("TECNICO"), id, "suprimir", Map.of("motivo", "teste", "minutos", 10), 403);
        acao(token, id, "suprimir", Map.of("motivo", "teste", "minutos", 10), 409);
        acao(token, id, "suprimir", Map.of("motivo", "", "minutos", 0), 400);
    }

    @Test
    void supressaoComPrazoVoltaSozinhaENaoAbreOutro() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 3, 1120, A_ALARME);
        long id = listar(token, "").get("conteudo").get(0).get("id").asLong();
        JsonNode suprimido = acao(token, id, "suprimir",
                Map.of("motivo", "Máquina ao lado em manutenção", "minutos", 60), 200);
        assertThat(suprimido.get("estado").asText()).isEqualTo("suprimido");
        assertThat(suprimido.get("motivo_supressao").asText()).isEqualTo("Máquina ao lado em manutenção");
        assertThat(acao(token, id, "cancelar-supressao", null, 200).get("estado").asText())
                .isEqualTo("ativo_nao_reconhecido");
        acao(token, id, "cancelar-supressao", null, 409);
        acao(token, id, "suprimir", Map.of("motivo", "de novo", "minutos", 1), 200);

        // volta ao normal e sai de novo durante a supressão: continua o MESMO alerta, suprimido
        t = enviarSequencia(t, 3, 1120, CORTE);
        t = enviarSequencia(t, 3, 1120, A_ALARME);
        assertThat(contar("alerta")).isEqualTo(1);
        enviarSequencia(t, 3, 1120, CORTE);
        assertThat(alertas.expirarSupressoes()).isZero();

        // prazo vencido: volta ao estado que teria (normalizado, sem reconhecimento)
        jdbc.update("UPDATE alerta SET suprimido_ate = now() - interval '1 second'");
        assertThat(alertas.expirarSupressoes()).isEqualTo(1);
        JsonNode depois = corpo(mvc.perform(comToken(get("/api/v1/alertas/" + id), token)));
        assertThat(depois.get("alerta").get("estado").asText()).isEqualTo("normalizado_nao_reconhecido");
        assertThat(depois.get("historico").toString()).contains("supressao_encerrada", "fim do prazo");
    }

    @Test
    void janelaRecuperadaNaoAbreMasAPrimeiraAoVivoAbre() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant antiga = Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        enviarSequencia(antiga, 4, 1120, SEVERO);
        assertThat(estadoDoPonto("A")).isEqualTo(2);
        assertThat(contar("alerta")).isZero();
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 1, 1120, SEVERO);
        assertThat(contar("alerta")).isEqualTo(3);
    }

    @Test
    void ensaioDeCondicaoMarcaOAlertaEFicaForaDosIndicadores() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        long ensaio = abrirEnsaio(token, "T3", "avanco_excessivo", 1120, null);
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 3, 1120, SEVERO);
        encerrarEnsaio(token, ensaio);
        JsonNode a = listar(token, "&ponto=B").get("conteudo").get(0);
        assertThat(a.get("condicao_ensaio").asText()).isEqualTo("avanco_excessivo");
        assertThat(a.get("durante_ensaio_de_condicao").asBoolean()).isTrue();
        JsonNode historico = corpo(mvc.perform(comToken(get("/api/v1/alertas/" + a.get("id").asLong()), token)));
        assertThat(historico.get("historico").get(0).get("detalhe").asText())
                .isEqualTo("durante ensaio de avanco_excessivo");

        JsonNode diag = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/alarmes/diagnostico?simulado=true"), token)).andExpect(status().isOk()));
        assertThat(diag.get("indicadores").get("alertas_por_hora").asDouble()).isZero();
        assertThat(diag.get("indicadores").get("pior_dez_minutos").asLong()).isZero();
    }

    @Test
    void instrumentoAbreComAcaoDoSensorENormaliza() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        for (int i = 0; i < 6; i++) {
            Map<String, Object> p = janela(DISPOSITIVO_SIM, t, 1120, VAZIO[0], VAZIO[1], VAZIO[2]);
            ((Map<?, ?>) p.get("pontos")).remove("C");
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
            t = t.plusSeconds(5);
        }
        JsonNode a = listar(token, "&tipo=instrumento").get("conteudo").get(0);
        assertThat(a.get("ponto").asText()).isEqualTo("C");
        assertThat(a.get("prioridade").asText()).isEqualTo("baixa");
        assertThat(a.get("acao_recomendada").asText()).startsWith("Conferir a fixação do sensor C");
        assertThat(a.get("explicacao").asText()).contains("sumiu do envio");
        enviarSequencia(t, 3, 1120, VAZIO);
        assertThat(listar(token, "&tipo=instrumento").get("conteudo").get(0).get("estado").asText())
                .isEqualTo("normalizado_nao_reconhecido");
    }

    @Test
    void semT0ECalibracaoDiferenteViramAvisos() throws Exception {
        String token = tokenAdmin();
        Map<String, String> calibracao = Map.of("A", "A-1", "B", "B-1", "C", "C-1");
        Instant t = Instant.now().minus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        for (String etapa : new String[] {"T1", "T3"}) {
            double[] rms = etapa.equals("T1") ? VAZIO : CORTE;
            long ensaio = abrirEnsaio(token, etapa, "normal", 1120, null);
            for (int i = 0; i < 25; i++) {
                Map<String, Object> p = janela(DISPOSITIVO_SIM, t, 1120, rms[0], rms[1], rms[2]);
                p.put("calibracao", calibracao);
                enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
                t = t.plusSeconds(5);
            }
            encerrarEnsaio(token, ensaio);
        }
        recalcular(token);

        // B e C severos com a calibração da referência: alerta aberto
        Instant agora = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        for (int i = 0; i < 3; i++) {
            Map<String, Object> p = janela(DISPOSITIVO_SIM, agora.plusSeconds(5L * i), 1120, CORTE[0], SEVERO[1],
                    SEVERO[2]);
            p.put("calibracao", calibracao);
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
        }
        assertThat(listar(token, "&ponto=B").get("total_elementos").asLong()).isEqualTo(1);
        // janela saturada: não avaliável; o alerta continua como estava
        Map<String, Object> saturada = janela(DISPOSITIVO_SIM, agora.plusSeconds(15), 1120, 0.1, 0.1, 0.1);
        saturada.put("saturou", true);
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, saturada).andExpect(status().isCreated());
        assertThat(listar(token, "&ponto=B").get("conteudo").get(0).get("estado").asText())
                .isEqualTo("ativo_nao_reconhecido");

        // sensor A recalibrado: a avaliação do A fica de fora e o diagnóstico pede recalcular
        Map<String, Object> recalibrada = janela(DISPOSITIVO_SIM, agora.plusSeconds(20), 1120, CORTE[0], CORTE[1],
                CORTE[2]);
        recalibrada.put("calibracao", Map.of("A", "A-2", "B", "B-1", "C", "C-1"));
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, recalibrada).andExpect(status().isCreated());
        JsonNode diag = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/alarmes/diagnostico?simulado=true"), token)));
        assertThat(diag.get("piso_ruido_medido").asBoolean()).isFalse();
        assertThat(diag.get("avisos").get(0).asText()).startsWith("Sem piso de ruído medido");
        assertThat(diag.get("avisos").get(1).asText()).contains("Sensor A com calibração diferente");
        assertThat(diag.get("pontos").get(0).get("janelas_calibracao_diferente").asLong()).isEqualTo(1);
        assertThat(diag.get("pontos").get(0).get("piso_ruido_rms").isNull()).isTrue();
    }

    @Test
    void diagnosticoELimites() throws Exception {
        String token = tokenDe("OPERADOR");
        JsonNode limites = corpo(mvc.perform(comToken(get("/api/v1/alarmes/limites"), token))
                .andExpect(status().isOk()));
        assertThat(limites.get("alarme").get("z_atencao").asDouble()).isEqualTo(3);
        assertThat(limites.get("alarme").get("atraso_s").asDouble()).isEqualTo(15);
        assertThat(limites.get("referencia").get("deriva").get("fracao_maxima").asDouble()).isEqualTo(0.3);
        assertThat(limites.get("os").get("alarme_continuo_s").asDouble()).isEqualTo(120);

        JsonNode vazio = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/alarmes/diagnostico?simulado=true"), token)));
        assertThat(vazio.get("avisos").get(0).asText()).startsWith("Sem referência calculada");
        mvc.perform(comToken(get("/api/v1/maquinas/999999/alarmes/diagnostico"), token))
                .andExpect(status().isNotFound());

        String admin = tokenAdmin();
        prepararReferencia(admin);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 4, 1120, CORTE);
        enviarSequencia(t, 3, 1120, SEVERO);
        JsonNode diag = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/alarmes/diagnostico?simulado=true"), token)));
        assertThat(diag.get("piso_ruido_medido").asBoolean()).isTrue();
        assertThat(diag.get("referencia_versao").asInt()).isEqualTo(1);
        assertThat(diag.get("indicadores").get("alertas_por_hora").asDouble()).isEqualTo(3 / 24.0);
        assertThat(diag.get("indicadores").get("pior_dez_minutos").asLong()).isEqualTo(3);
        JsonNode pontoA = diag.get("pontos").get(0);
        assertThat(pontoA.get("ponto").asText()).isEqualTo("A");
        assertThat(pontoA.get("severidade_hoje").asDouble()).isPositive();
        assertThat(pontoA.get("severidade_desde_os").asDouble()).isPositive();
        assertThat(pontoA.get("deriva_janelas").asInt()).isEqualTo(4);
        assertThat(pontoA.get("deriva_pct").asDouble()).isBetween(-3.0, 3.0);
        assertThat(pontoA.get("piso_ruido_rms").asDouble()).isPositive();
        assertThat(diag.get("avisos")).isEmpty();
    }
}
