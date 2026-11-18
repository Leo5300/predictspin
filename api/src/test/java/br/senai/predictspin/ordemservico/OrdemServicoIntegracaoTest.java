package br.senai.predictspin.ordemservico;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import com.fasterxml.jackson.databind.JsonNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

class OrdemServicoIntegracaoTest extends AlarmeIntegracaoBase {

    /** A pouco acima do limite de ALARME (z ≈ 5,5 no 1X contra o corte): a severidade cresce devagar. */
    private static final double[] A_ALARME_LEVE = {0.1785, CORTE[1], CORTE[2]};

    private JsonNode listar(String token, String filtro) throws Exception {
        return corpo(mvc.perform(comToken(get("/api/v1/ordens-servico?simulado=true" + filtro), token))
                .andExpect(status().isOk()));
    }

    private JsonNode acao(String token, long id, String acao, Object corpo, int esperado) throws Exception {
        var req = comToken(post("/api/v1/ordens-servico/" + id + "/" + acao), token);
        if (corpo != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(corpo));
        }
        return corpo(mvc.perform(req).andExpect(status().is(esperado)));
    }

    @Test
    void alarmeContinuoAbreOsEOTecnicoConcluiRejeitada() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        // ALARME entra na 3ª janela (t = 10 s); 120 s seguidos em ALARME fecham na janela de t = 125 s
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 25, 1120, A_ALARME_LEVE);
        assertThat(contar("ordem_servico")).isZero();
        t = enviarSequencia(t, 1, 1120, A_ALARME_LEVE);
        JsonNode os = listar(token, "").get("conteudo").get(0);
        long id = os.get("id").asLong();
        assertThat(os.get("numero").asText()).matches("OS-\\d{4}-\\d{4}");
        assertThat(os.get("status").asText()).isEqualTo("aberta");
        assertThat(os.get("motivo_abertura").asText()).isEqualTo("alarme_continuo");
        assertThat(os.get("ponto").asText()).isEqualTo("A");
        assertThat(os.get("componente").asText()).isEqualTo("eixo-árvore e mancal dianteiro");
        assertThat(os.get("alerta_id").isNull()).isFalse();
        assertThat(os.get("acao_recomendada").asText()).isNotBlank();
        assertThat(os.get("explicacao").asText()).contains("A·");
        assertThat(os.get("severidade_acumulada").asDouble()).isPositive();
        assertThat(os.get("referencia_versao").asInt()).isEqualTo(1);

        // continuar em ALARME não abre outra
        enviarSequencia(t, 2, 1120, A_ALARME_LEVE);
        assertThat(contar("ordem_servico")).isEqualTo(1);

        acao(tokenDe("OPERADOR"), id, "assumir", null, 403);
        String tecnico = tokenDe("TECNICO");
        JsonNode assumida = acao(tecnico, id, "assumir", null, 200);
        assertThat(assumida.get("status").asText()).isEqualTo("em_andamento");
        assertThat(assumida.get("responsavel").asText()).startsWith("Usuário TECNICO");
        acao(tecnico, id, "assumir", null, 409);
        acao(tecnico, id, "concluir", Map.of("comentario", "sem retorno"), 400);
        JsonNode concluida = acao(tecnico, id, "concluir", Map.of("retorno", "rejeitada",
                "comentario", " Ferramenta conferida, sem desgaste "), 200);
        assertThat(concluida.get("status").asText()).isEqualTo("concluida");
        assertThat(concluida.get("retorno_tecnico").asText()).isEqualTo("rejeitada");
        assertThat(concluida.get("comentario_tecnico").asText()).isEqualTo("Ferramenta conferida, sem desgaste");
        assertThat(concluida.get("concluida_em").isNull()).isFalse();
        acao(tecnico, id, "concluir", Map.of("retorno", "confirmada"), 409);
        // o retorno vira rótulo no alerta de origem
        assertThat(jdbc.queryForObject("SELECT retorno_tecnico FROM alerta WHERE id = ?", String.class,
                os.get("alerta_id").asLong())).isEqualTo("rejeitada");

        mvc.perform(comToken(get("/api/v1/ordens-servico/" + id), token)).andExpect(status().isOk());
        mvc.perform(comToken(get("/api/v1/ordens-servico/999999"), token)).andExpect(status().isNotFound());
        acao(token, 999999, "assumir", null, 404);
        assertThat(listar(token, "&status=concluida&ponto=A&maquina_id=" + maquinaId).get("total_elementos")
                .asLong()).isEqualTo(1);
        assertThat(listar(token, "&status=aberta").get("total_elementos").asLong()).isZero();
    }

    @Test
    void severidadeAcumuladaAbreOsEZeraOContador() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        // SEVERO: z ≈ 66 no 1X do A, ≈ 313 z·s por janela. Durante o atraso (2 janelas) nada conta para a OS;
        // a 3ª janela entra em ALARME, abre o alerta e soma 313; a 4ª passa de 600
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 3, 1120, SEVERO);
        assertThat(contar("ordem_servico")).isZero();
        enviarSequencia(t, 1, 1120, SEVERO);
        JsonNode lista = listar(token, "&ponto=A");
        assertThat(lista.get("total_elementos").asLong()).isEqualTo(1);
        JsonNode os = lista.get("conteudo").get(0);
        assertThat(os.get("motivo_abertura").asText()).isEqualTo("severidade");
        assertThat(os.get("severidade_acumulada").asDouble()).isGreaterThan(600);
        // o alerta de origem é o alerta de máquina do ponto, aberto na 3ª janela
        long alertaDoA = jdbc.queryForObject("""
                SELECT a.id FROM alerta a JOIN ponto_medicao pm ON pm.id = a.ponto_medicao_id
                WHERE pm.codigo = 'A' AND a.tipo = 'maquina'
                """, Long.class);
        assertThat(os.get("alerta_id").asLong()).isEqualTo(alertaDoA);
        assertThat(os.get("explicacao").asText()).contains("A·");
        // concluir direto, sem assumir: quem conclui vira o responsável
        JsonNode concluida = acao(token, os.get("id").asLong(), "concluir", Map.of("retorno", "confirmada"), 200);
        assertThat(concluida.get("responsavel").asText()).isEqualTo("Admin dos Testes");
        assertThat(concluida.get("comentario_tecnico").isNull()).isTrue();
        assertThat(jdbc.queryForObject("""
                SELECT e.severidade_desde_os FROM estado_ponto e JOIN ponto_medicao pm ON pm.id = e.ponto_medicao_id
                WHERE pm.codigo = 'A' AND e.simulado
                """, Double.class)).isZero();
    }

    @Test
    void severidadeAltaDuranteOAtrasoNaoAbreOsNemSemAlerta() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        // 2 janelas severas (10 s, abaixo do atraso de 15 s) e volta ao normal: ≈ 626 z·s no histórico do dia,
        // nenhum alerta, nenhuma OS e nada no contador que dispara OS
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 2, 1120, SEVERO);
        enviarSequencia(t, 4, 1120, CORTE);
        assertThat(contar("alerta")).isZero();
        assertThat(contar("ordem_servico")).isZero();
        assertThat(jdbc.queryForObject("SELECT sum(valor) FROM severidade_acumulada", Double.class))
                .isGreaterThan(600);
        assertThat(jdbc.queryForObject("SELECT max(severidade_desde_os) FROM estado_ponto", Double.class)).isZero();
    }

    @Test
    void alertaSuprimidoNaoAbreOs() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 3, 1120, SEVERO);
        assertThat(contar("alerta")).isEqualTo(3);
        for (Long id : jdbc.queryForList("SELECT id FROM alerta", Long.class)) {
            mvc.perform(comToken(post("/api/v1/alertas/" + id + "/suprimir"), token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"motivo\":\"máquina ao lado em manutenção\",\"minutos\":60}"))
                    .andExpect(status().isOk());
        }
        // mais de 2 min em ALARME e severidade muito acima de 600: suprimido, nada abre
        enviarSequencia(t, 30, 1120, SEVERO);
        assertThat(contar("ordem_servico")).isZero();
        assertThat(contar("alerta")).isEqualTo(3);
    }

    @Test
    void recuperacaoLongaForaDoNormalSeguidaDeJanelaAoVivoNormalNaoAbreOs() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        // 40 janelas antigas (200 s) severas, vindas da fila do dispositivo: andam o estado (ALARME), mas não
        // contam tempo de ALARME nem severidade para a OS
        enviarSequencia(Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS), 40, 1120,
                SEVERO);
        assertThat(estadoDoPonto("A")).isEqualTo(2);
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 1, 1120, CORTE);
        assertThat(contar("ordem_servico")).isZero();
    }

    @Test
    void ensaioDeCondicaoEJanelaRecuperadaNaoAbremOs() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        enviarSequencia(Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS), 8, 1120,
                SEVERO);
        long ensaio = abrirEnsaio(token, "T3", "ferramenta_desgastada", 1120, null);
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 8, 1120, SEVERO);
        encerrarEnsaio(token, ensaio);
        assertThat(contar("ordem_servico")).isZero();
        // os alertas abriram (marcados), mas nenhum deles virou OS
        assertThat(contar("alerta")).isEqualTo(3);
    }

    @Test
    void instrumentoNaoAbreOs() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        for (int i = 0; i < 10; i++) {
            Map<String, Object> p = janela(DISPOSITIVO_SIM, t, 1120, VAZIO[0], VAZIO[1], VAZIO[2]);
            ((Map<?, ?>) p.get("pontos")).remove("C");
            enviar(DISPOSITIVO_SIM, CHAVE_SIM, p).andExpect(status().isCreated());
            t = t.plusSeconds(5);
        }
        assertThat(contar("alerta")).isEqualTo(1);
        assertThat(contar("ordem_servico")).isZero();
    }
}
