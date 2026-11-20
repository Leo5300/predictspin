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

/** Perfil de teste com tendência e todos os canais ligados; séries SINTÉTICAS gravadas direto no banco. */
@TestPropertySource(properties = {"ps.tendencia.habilitada=true", "ps.tendencia.min-dias=7",
        "ps.fusao.canais.temp_cabecote_c.habilitado=true", "ps.fusao.canais.temp_ferramenta_c.habilitado=true",
        "ps.fusao.canais.nivel_som_db.habilitado=true", "ps.fusao.canais.corrente_a.habilitado=true",
        "ps.fusao.canais.amb_temp_c.habilitado=true", "ps.fusao.canais.amb_umid_pct.habilitado=true"})
class TendenciaEFusaoLigadasIntegracaoTest extends AlarmeIntegracaoBase {

    @Test
    void canaisHabilitadosEntramNoVetor() throws Exception {
        JsonNode r = corpo(mvc.perform(get("/api/v1/treino/servico/conjunto/resumo?simulado=true&maquina_id="
                + maquinaId).header("X-Treino-Chave", "chave-treino-teste")).andExpect(status().isOk()));
        assertThat(r.get("canais")).hasSize(6);
        assertThat(r.get("caracteristicas")).hasSize(31);
        assertThat(r.get("caracteristicas").toString()).contains("canal_nivel_som_db", "canal_temp_cabecote_c");
    }

    @Test
    void tendenciaComSeriesSinteticas() throws Exception {
        String admin = tokenAdmin();
        prepararReferencia(admin);
        long pontoA = jdbc.queryForObject("SELECT id FROM ponto_medicao WHERE maquina_id = ? AND codigo = 'A'",
                Long.class, maquinaId);
        long pontoB = jdbc.queryForObject("SELECT id FROM ponto_medicao WHERE maquina_id = ? AND codigo = 'B'",
                Long.class, maquinaId);
        LocalDate hoje = LocalDate.now(ZoneOffset.UTC);
        for (int d = 0; d < 10; d++) {
            Instant dia = hoje.minusDays(9 - d).atStartOfDay().toInstant(ZoneOffset.UTC);
            // A sobe 40 z·s por dia (de 100); B fica parado em 50; só 5 dias de C (curto demais)
            inserirSeveridade(pontoA, dia, 100 + 40 * d);
            inserirSeveridade(pontoB, dia, 50);
        }
        // temperatura do cabeçote: janelas com os canais (payload padrão dos testes)
        Instant agora = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        enviarSimulado(agora);
        enviarSimulado(agora.plusSeconds(5));
        JsonNode t = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/tendencia?simulado=true"),
                admin)).andExpect(status().isOk()));
        assertThat(t.get("habilitada").asBoolean()).isTrue();
        JsonNode a = serie(t, "A", "severidade");
        assertThat(a.get("dias")).hasSize(10);
        assertThat(a.get("inclinacao_por_dia").asDouble()).isEqualTo(40.0);
        assertThat(a.get("texto").asText()).startsWith("se continuar assim, entre");
        JsonNode b = serie(t, "B", "severidade");
        assertThat(b.get("texto").asText()).isEqualTo("sem tendência de subida");
        // deriva e temperatura com 1 dia só: sem estimativa
        assertThat(serie(t, "A", "deriva").get("texto").asText()).contains("sem estimativa");
        assertThat(serie(t, "A", "temp_cabecote_c").get("inclinacao_por_dia").isNull()).isTrue();
        JsonNode diag = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/ia/diagnostico?simulado=true"), admin)));
        assertThat(diag.get("tendencia_habilitada").asBoolean()).isTrue();
        diag.get("canais").forEach(c -> assertThat(c.get("habilitado").asBoolean()).isTrue());
    }

    private void inserirSeveridade(long ponto, Instant dia, double valor) {
        jdbc.update("""
                INSERT INTO severidade_acumulada (maquina_id, janela_inicio, janela_fim, valor, ponto_medicao_id,
                                                  simulado)
                VALUES (?, ?, ?, ?, ?, true)
                ON CONFLICT (ponto_medicao_id, simulado, janela_inicio) WHERE ponto_medicao_id IS NOT NULL
                DO UPDATE SET valor = EXCLUDED.valor
                """, maquinaId, dia.atOffset(ZoneOffset.UTC), dia.plus(1, ChronoUnit.DAYS).atOffset(ZoneOffset.UTC),
                valor, ponto);
    }

    private JsonNode serie(JsonNode t, String ponto, String nome) {
        for (JsonNode p : t.get("pontos")) {
            if (p.get("ponto").asText().equals(ponto)) {
                for (JsonNode s : p.get("series")) {
                    if (s.get("serie").asText().equals(nome)) {
                        return s;
                    }
                }
            }
        }
        throw new AssertionError(ponto + " " + nome + " em " + t);
    }
}
