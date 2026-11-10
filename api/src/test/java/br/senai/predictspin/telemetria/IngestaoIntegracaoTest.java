package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.IntegracaoBase;

class IngestaoIntegracaoTest extends IntegracaoBase {

    private final Instant medidoEm = Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(60);

    @Test
    void janelaValidaResponde201EGravaPontosECanais() throws Exception {
        enviarReal(medidoEm)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.duplicada").value(false))
                .andExpect(jsonPath("$.janela_id").isNumber())
                .andExpect(jsonPath("$.ensaio_id", nullValue()));

        assertThat(contar("janela")).isEqualTo(1);
        assertThat(contar("telemetria")).isEqualTo(3);
        assertThat(contar("leitura")).isEqualTo(5);
        Map<String, Object> janela = jdbc.queryForMap("SELECT rotacao_rpm, saturou, medido_em FROM janela");
        assertThat(janela.get("rotacao_rpm")).isEqualTo(1200.0);
        assertThat(janela.get("saturou")).isEqualTo(false);
        Double rmsB = jdbc.queryForObject("""
                SELECT t.rms_g FROM telemetria t JOIN ponto_medicao p ON p.id = t.ponto_medicao_id WHERE p.codigo = 'B'
                """, Double.class);
        assertThat(rmsB).isEqualTo(0.20);
    }

    @Test
    void canaisSaoOpcionaisInteirosOuChaveAChave() throws Exception {
        var semCanais = payload(DISPOSITIVO_REAL, medidoEm);
        semCanais.remove("canais");
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, semCanais).andExpect(status().isCreated());

        var umCanal = payload(DISPOSITIVO_REAL, medidoEm.plusSeconds(5));
        umCanal.put("canais", Map.of("corrente_a", 3.9));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, umCanal).andExpect(status().isCreated());

        assertThat(contar("janela")).isEqualTo(2);
        assertThat(contar("leitura")).isEqualTo(1);
    }

    @Test
    void reenvioDoMesmoInstanteNaoDuplicaEResponde200() throws Exception {
        long janelaId = corpo(enviarReal(medidoEm).andExpect(status().isCreated())).get("janela_id").asLong();

        enviarReal(medidoEm)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.duplicada").value(true))
                .andExpect(jsonPath("$.janela_id").value(janelaId));
        // Mesmo instante escrito com fração de segundo explícita
        var mesmoInstante = payload(DISPOSITIVO_REAL, medidoEm);
        mesmoInstante.put("medido_em", medidoEm.toString().replace("Z", ".000Z"));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, mesmoInstante).andExpect(status().isOk());

        assertThat(contar("janela")).isEqualTo(1);
        assertThat(contar("telemetria")).isEqualTo(3);
        assertThat(contar("leitura")).isEqualTo(5);
    }

    @Test
    void mesmoInstanteDeOutroDispositivoEhOutraJanela() throws Exception {
        enviarReal(medidoEm).andExpect(status().isCreated());
        enviarSimulado(medidoEm).andExpect(status().isCreated());
        assertThat(contar("janela")).isEqualTo(2);
    }

    @Test
    void atualizaUltimoContatoDoDispositivo() throws Exception {
        Instant antes = Instant.now().minusSeconds(1);
        enviarReal(medidoEm).andExpect(status().isCreated());
        var contato = jdbc.queryForObject("SELECT ultimo_contato FROM dispositivo WHERE identificador = ?",
                java.sql.Timestamp.class, DISPOSITIVO_REAL);
        assertThat(contato).isNotNull();
        assertThat(contato.toInstant()).isAfter(antes);
    }

    @Test
    void chaveErradaOuAusenteResponde401() throws Exception {
        enviar(DISPOSITIVO_REAL, "chave-errada", payload(DISPOSITIVO_REAL, medidoEm))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        enviar("ps-inexistente", CHAVE_REAL, payload("ps-inexistente", medidoEm))
                .andExpect(status().isUnauthorized());
        // chave de um dispositivo usada com o identificador de outro
        enviar(DISPOSITIVO_REAL, CHAVE_SIM, payload(DISPOSITIVO_REAL, medidoEm)).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/telemetria")
                        .contentType("application/json").content(json.writeValueAsString(payload(DISPOSITIVO_REAL, medidoEm))))
                .andExpect(status().isUnauthorized());
        assertThat(contar("janela")).isZero();
    }

    @Test
    void dispositivoInativoResponde401() throws Exception {
        jdbc.update("UPDATE dispositivo SET ativo = false WHERE identificador = ?", DISPOSITIVO_REAL);
        enviarReal(medidoEm).andExpect(status().isUnauthorized());
    }

    @Test
    void dispositivoDoCorpoDiferenteDoCabecalhoResponde403() throws Exception {
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, payload(DISPOSITIVO_SIM, medidoEm))
                .andExpect(status().isForbidden());
        assertThat(contar("janela")).isZero();
    }

    @Test
    void campoObrigatorioAusenteOuNegativoResponde400ComNomeDoCampo() throws Exception {
        var p = payload(DISPOSITIVO_REAL, medidoEm);
        @SuppressWarnings("unchecked")
        Map<String, Object> pontos = (Map<String, Object>) p.get("pontos");
        var a = medida(0.1);
        a.remove("rms_g");
        a.put("o3x", -1.0);
        pontos.put("A", a);

        enviar(DISPOSITIVO_REAL, CHAVE_REAL, p)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo == 'pontos[A].rms_g')]").exists())
                .andExpect(jsonPath("$.campos[?(@.campo == 'pontos[A].o3x')]").exists());

        var semMedidoEm = payload(DISPOSITIVO_REAL, medidoEm);
        semMedidoEm.remove("medido_em");
        semMedidoEm.put("rotacao_rpm", -5);
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, semMedidoEm)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.length()").value(2));

        var semPontos = payload(DISPOSITIVO_REAL, medidoEm);
        semPontos.put("pontos", Map.of());
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, semPontos).andExpect(status().isBadRequest());
        assertThat(contar("janela")).isZero();
    }

    @Test
    void pontoOuCanalDesconhecidoResponde400() throws Exception {
        var pontoZ = payload(DISPOSITIVO_REAL, medidoEm);
        pontoZ.put("pontos", Map.of("Z", medida(0.1)));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, pontoZ)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("[Z]")));

        var canalX = payload(DISPOSITIVO_REAL, medidoEm);
        canalX.put("canais", Map.of("pressao_bar", 2.0));
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, canalX).andExpect(status().isBadRequest());
        assertThat(contar("janela")).isZero();
    }

    @Test
    void jsonMalFormadoOuDataInvalidaResponde400() throws Exception {
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, "{\"dispositivo\": ").andExpect(status().isBadRequest());
        var dataRuim = payload(DISPOSITIVO_REAL, medidoEm);
        dataRuim.put("medido_em", "ontem");
        enviar(DISPOSITIVO_REAL, CHAVE_REAL, dataRuim)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("medido_em")));
    }

    @Test
    void medidoEmNoFuturoResponde400() throws Exception {
        enviarReal(Instant.now().plus(1, ChronoUnit.HOURS)).andExpect(status().isBadRequest());
        enviarReal(Instant.now().plusSeconds(60)).andExpect(status().isCreated());
    }
}
