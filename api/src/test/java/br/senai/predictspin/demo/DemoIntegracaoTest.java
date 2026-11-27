package br.senai.predictspin.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import br.senai.predictspin.AlarmeIntegracaoBase;

/**
 * A demonstração inteira sobre o PostgreSQL real: rotas, permissão, o caminho da ingestão (avaliação, alerta,
 * OS) e a prova de que as janelas da demonstração ficam fora do ensaio, da referência e do treino.
 * O gerador roda de relógio parado ({@code passo-ms} enorme): o teste manda as janelas na hora que quer.
 */
@TestPropertySource(properties = {"ps.demo.habilitado=true", "ps.demo.passo-ms=3600000"})
class DemoIntegracaoTest extends AlarmeIntegracaoBase {

    private static final String CHAVE_TREINO = "chave-treino-teste";

    @Autowired
    DemoService demo;

    @BeforeEach
    void pararDemo() {
        demo.definir(NivelDemo.PARADA, "teste");
    }

    private JsonNode estado(String token) throws Exception {
        return corpo(mvc.perform(comToken(get("/api/v1/demo/estado"), token)).andExpect(status().isOk()));
    }

    private JsonNode cenario(String token, String nivel) throws Exception {
        return corpo(mvc.perform(comToken(post("/api/v1/demo/cenario"), token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nivel\":\"" + nivel + "\"}"))
                .andExpect(status().isOk()));
    }

    /** Envia {@code n} janelas do nível, de 5 s em 5 s a partir de {@code inicio}; devolve o instante seguinte. */
    private Instant emitir(Instant inicio, int n) throws Exception {
        Instant t = inicio;
        for (int i = 0; i < n; i++) {
            assertThat(demo.emitir(t)).as("janela %d enviada", i).isTrue();
            t = t.plusSeconds(5);
        }
        assertThat(filaDeAvaliacao.aguardarOcioso(Duration.ofSeconds(30))).isTrue();
        return t;
    }

    private static Instant agora() {
        return Instant.now().truncatedTo(ChronoUnit.SECONDS);
    }

    // ---------------------------------------------------------------- permissão e rotas

    @Test
    void semTokenDa401ESoAdminPodeUsarAsRotas() throws Exception {
        mvc.perform(get("/api/v1/demo/estado")).andExpect(status().isUnauthorized());
        for (String papel : List.of("TECNICO", "OPERADOR")) {
            String token = tokenDe(papel);
            mvc.perform(comToken(get("/api/v1/demo/estado"), token)).andExpect(status().isForbidden());
            mvc.perform(comToken(post("/api/v1/demo/cenario"), token).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"nivel\":\"ALARME\"}")).andExpect(status().isForbidden());
        }
        assertThat(estado(tokenAdmin()).get("nivel").asText()).isEqualTo("PARADA");
    }

    @Test
    void nivelInvalidoEFaltandoSao400() throws Exception {
        String token = tokenAdmin();
        for (String corpo : List.of("{\"nivel\":\"SEVERO\"}", "{}", "{\"nivel\":null}")) {
            mvc.perform(comToken(post("/api/v1/demo/cenario"), token).contentType(MediaType.APPLICATION_JSON)
                    .content(corpo)).andExpect(status().isBadRequest());
        }
    }

    @Test
    void semReferenciaOEstadoAvisaENadaEGerado() throws Exception {
        String token = tokenAdmin();
        JsonNode inicial = estado(token);
        assertThat(inicial.get("habilitado").asBoolean()).isTrue();
        assertThat(inicial.get("referencia_ok").asBoolean()).isFalse();
        assertThat(inicial.get("mensagem").asText()).contains("Sem referência simulada ativa para 1120 rpm");

        JsonNode depois = cenario(token, "ALARME");
        assertThat(depois.get("nivel").asText()).isEqualTo("PARADA");
        assertThat(depois.get("referencia_ok").asBoolean()).isFalse();
        assertThat(demo.emitir(agora())).isFalse();
        assertThat(contar("janela")).isZero();
    }

    // ---------------------------------------------------------------- a cadeia inteira

    @Test
    void alarmeGeraAtencaoEAlarmeNoAEAtencaoNoBPelaMesmaIngestaoDoPost() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        assertThat(estado(token).get("referencia_ok").asBoolean()).isTrue();

        JsonNode resposta = cenario(token, "ALARME");
        assertThat(resposta.get("nivel").asText()).isEqualTo("ALARME");
        assertThat(resposta.get("volta_normal_em_s").asLong()).isBetween(290L, 300L);
        assertThat(resposta.get("hardware_real_ativo").asBoolean()).isFalse();

        // 15 s de atraso: com janelas de 5 s, a terceira já entra em alarme
        emitir(agora(), 5);

        assertThat(estadoDoPonto("A")).isEqualTo(2);
        assertThat(estadoDoPonto("B")).isEqualTo(1);
        assertThat(estadoDoPonto("C")).isZero();
        List<Map<String, Object>> alertas = jdbc.queryForList(
                "SELECT pm.codigo, a.nivel, a.simulado FROM alerta a JOIN ponto_medicao pm ON pm.id = a.ponto_medicao_id"
                        + " WHERE a.tipo = 'maquina' ORDER BY pm.codigo");
        assertThat(alertas).extracting(m -> m.get("codigo")).containsExactly("A", "B");
        assertThat(alertas.get(0)).containsEntry("nivel", "alarme").containsEntry("simulado", true);
        assertThat(alertas.get(1)).containsEntry("nivel", "atencao");
        // o estado da máquina é o pior entre os pontos, e sai pela mesma rota de avaliação que o painel usa
        JsonNode avaliacao = corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/avaliacao?simulado=true"), token)).andExpect(status().isOk()));
        assertThat(avaliacao.toString()).contains("\"alarme\"");
    }

    @Test
    void atencaoGeraAtencaoSoNoA() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        cenario(token, "ATENCAO");
        emitir(agora(), 5);
        assertThat(estadoDoPonto("A")).isEqualTo(1);
        assertThat(estadoDoPonto("B")).isZero();
        assertThat(estadoDoPonto("C")).isZero();
        assertThat(contar("alerta")).isEqualTo(1);
    }

    @Test
    void normalNaoGeraAtencaoNemAlerta() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        cenario(token, "NORMAL");
        emitir(agora(), 12);
        for (String ponto : List.of("A", "B", "C")) {
            assertThat(estadoDoPonto(ponto)).isZero();
        }
        assertThat(contar("alerta")).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM avaliacao WHERE situacao = 0", Long.class)).isPositive();
    }

    // ---------------------------------------------------------------- fora do ensaio, da referência e do treino

    @Test
    void janelasDaDemonstracaoSaemSemEnsaioMarcadasESimuladasMesmoComEnsaioAberto() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        long ensaio = abrirEnsaio(token, "T1", "normal", 1120, null);
        // controle: uma janela comum, enviada pelo dispositivo, entra no ensaio aberto
        enviarSequencia(agora().plusSeconds(60), 1, 1120, VAZIO);
        cenario(token, "NORMAL");
        emitir(agora(), 3);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM janela WHERE ensaio_id = ?", Long.class, ensaio))
                .isEqualTo(1);
        List<Map<String, Object>> demo = jdbc.queryForList("""
                SELECT j.ensaio_id, j.demonstracao, d.simulado, d.identificador, j.firmware_versao
                FROM janela j JOIN dispositivo d ON d.id = j.dispositivo_id WHERE j.demonstracao""");
        assertThat(demo).hasSize(3);
        for (Map<String, Object> janela : demo) {
            assertThat(janela.get("ensaio_id")).isNull();
            assertThat(janela.get("simulado")).isEqualTo(true);
            assertThat(janela.get("identificador")).isEqualTo("ps-sim-01");
            assertThat(janela.get("firmware_versao")).isEqualTo("simulado");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM janela WHERE NOT demonstracao AND ensaio_id IS NULL",
                Long.class)).isZero();
        encerrarEnsaio(token, ensaio);
    }

    @Test
    void janelasDaDemonstracaoNaoEntramNoRecalculoDaReferencia() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        // janelas de uso comuns, avaliadas NORMAL: entram na deriva (controle)
        enviarSequencia(agora().minusSeconds(120), 3, 1120, VAZIO);
        // 10 da demonstração, também avaliadas NORMAL: poderiam entrar, e não podem
        cenario(token, "NORMAL");
        emitir(agora(), 10);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM janela j JOIN avaliacao a ON a.janela_id = j.id
                WHERE j.demonstracao AND a.estado = 0 AND a.etapa_ref IS NOT NULL""", Long.class)).isPositive();

        JsonNode versao = recalcular(token);
        assertThat(versao.get("janelas_deriva").asInt()).isEqualTo(3);
        assertThat(versao.get("janelas_usadas").asInt()).isEqualTo(75);
    }

    @Test
    void janelasDaDemonstracaoNaoViramRotuloDeTreinoPeloRetornoDaOs() throws Exception {
        String token = tokenAdmin();
        prepararReferencia(token);
        long antes = candidatasDoTreino();

        // episódio da demonstração: 30 janelas de alarme (a OS abre com 120 s de alarme), e volta ao normal
        cenario(token, "ALARME");
        Instant t = emitir(agora(), 30);
        cenario(token, "NORMAL");
        emitir(t, 6);
        List<Long> abertas = new java.util.ArrayList<>();
        corpo(mvc.perform(comToken(get("/api/v1/ordens-servico?simulado=true&status=aberta"), token)))
                .get("conteudo").forEach(os -> abertas.add(os.get("id").asLong()));
        assertThat(abertas).as("a demonstração abre OS como o torno abriria").isNotEmpty();
        for (long id : abertas) {
            mvc.perform(comToken(post("/api/v1/ordens-servico/" + id + "/concluir"), token)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"retorno\":\"rejeitada\"}"))
                    .andExpect(status().isOk());
        }
        // sem a marca, as janelas do período da OS virariam candidatas "os_rejeitada"
        assertThat(candidatasDoTreino()).isEqualTo(antes);
    }

    private long candidatasDoTreino() throws Exception {
        return corpo(mvc.perform(get("/api/v1/treino/servico/conjunto/resumo?simulado=true&maquina_id=" + maquinaId)
                .header("X-Treino-Chave", CHAVE_TREINO)).andExpect(status().isOk())).get("total_candidatas").asLong();
    }
}
