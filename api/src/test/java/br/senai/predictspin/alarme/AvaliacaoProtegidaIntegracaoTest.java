package br.senai.predictspin.alarme;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import br.senai.predictspin.AlarmeIntegracaoBase;

/**
 * A avaliação roda depois do commit da janela e é protegida: um erro nela não muda a resposta do
 * POST /api/v1/telemetria nem desfaz a janela; vai para o log e para o contador do Diagnóstico.
 */
class AvaliacaoProtegidaIntegracaoTest extends AlarmeIntegracaoBase {

    @MockitoSpyBean
    private AvaliacaoRepository repositorio;

    @Autowired
    private AvaliacaoService avaliacoes;

    @AfterEach
    void voltarAoNormal() {
        doCallRealMethod().when(repositorio).travarEstados(any(), anyBoolean());
    }

    @Test
    void erroNaAvaliacaoNaoDerrubaAIngestao() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        long antes = avaliacoes.falhasDeAvaliacao();
        doThrow(new IllegalStateException("falha forçada no teste"))
                .when(repositorio).travarEstados(any(), anyBoolean());

        Instant t = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        var resposta = corpo(enviar(DISPOSITIVO_SIM, CHAVE_SIM, janela(DISPOSITIVO_SIM, t, 1120, SEVERO[0], SEVERO[1],
                SEVERO[2])).andExpect(status().isCreated()));
        long janelaId = resposta.get("janela_id").asLong();
        assertThat(resposta.get("duplicada").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM janela WHERE id = ?", Long.class, janelaId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM telemetria WHERE janela_id = ?", Long.class, janelaId))
                .isEqualTo(3);
        // sem avaliação desta janela (a transação da avaliação foi desfeita inteira)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM avaliacao WHERE janela_id = ?", Long.class, janelaId))
                .isZero();
        assertThat(avaliacoes.falhasDeAvaliacao()).isEqualTo(antes + 1);
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/alarmes/diagnostico?simulado=true"), token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.falhas_avaliacao").value(antes + 1));

        // reenvio da mesma janela continua idempotente (200, duplicada)
        enviar(DISPOSITIVO_SIM, CHAVE_SIM, janela(DISPOSITIVO_SIM, t, 1120, SEVERO[0], SEVERO[1], SEVERO[2]))
                .andExpect(status().isOk());

        // com a avaliação de volta, a janela seguinte é avaliada normalmente
        doCallRealMethod().when(repositorio).travarEstados(any(), anyBoolean());
        long seguinte = corpo(enviar(DISPOSITIVO_SIM, CHAVE_SIM, janela(DISPOSITIVO_SIM, t.plusSeconds(5), 1120,
                CORTE[0], CORTE[1], CORTE[2])).andExpect(status().isCreated())).get("janela_id").asLong();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM avaliacao WHERE janela_id = ?", Long.class, seguinte))
                .isEqualTo(3);
    }
}
