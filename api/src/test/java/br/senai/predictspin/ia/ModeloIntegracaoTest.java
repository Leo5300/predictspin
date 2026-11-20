package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import br.senai.predictspin.AlarmeIntegracaoBase;

/**
 * Ciclo inteiro da segunda opinião com o modelo de fixture (treinado pelo Python em sinal SINTÉTICO): treinar →
 * resultado pela rota do serviço → candidato → ativar (só ADMIN) → inferência nas janelas → alerta e OS com a
 * opinião. O modelo nunca muda estado, prioridade nem abertura.
 */
class ModeloIntegracaoTest extends AlarmeIntegracaoBase {

    static final String CHAVE = "chave-treino-teste";
    static final Path FIXTURE = Path.of("src", "test", "resources", "modelo-fixture");

    private JsonNode treinar(String token, int esperado) throws Exception {
        return corpo(mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/modelos/treinar?simulado=true"),
                token)).andExpect(status().is(esperado)));
    }

    /** Metadados da fixture, sem a referência (o id gravado pelo Python não existe no banco do teste). */
    private ObjectNode metadados() throws Exception {
        ObjectNode meta = (ObjectNode) json.readTree(Files.readAllBytes(FIXTURE.resolve("metadados.json")));
        meta.putNull("referencia_versao_id");
        return meta;
    }

    private org.springframework.test.web.servlet.ResultActions enviarResultado(long trabalho, ObjectNode meta,
                                                                              boolean comClasse) throws Exception {
        var req = multipart("/api/v1/treino/servico/trabalhos/" + trabalho + "/resultado")
                .file(new MockMultipartFile("anomalia", "anomalia.onnx", "application/octet-stream",
                        Files.readAllBytes(FIXTURE.resolve("anomalia.onnx"))))
                .file(new MockMultipartFile("arvores", "arvores.json", "application/json",
                        Files.readAllBytes(FIXTURE.resolve("arvores.json"))))
                .file(new MockMultipartFile("metadados", "metadados.json", "application/json",
                        json.writeValueAsBytes(meta)));
        if (comClasse) {
            req.file(new MockMultipartFile("classe", "classe.onnx", "application/octet-stream",
                    Files.readAllBytes(FIXTURE.resolve("classe.onnx"))));
        }
        return mvc.perform(req.header("X-Treino-Chave", CHAVE));
    }

    /** Treina pela rota (sem serviço configurado: o trabalho fica com o comando) e entrega a fixture. */
    private JsonNode candidato(String token, Consumer<ObjectNode> ajuste) throws Exception {
        long trabalho = treinar(token, 202).get("id").asLong();
        mvc.perform(post("/api/v1/treino/servico/trabalhos/" + trabalho + "/inicio").header("X-Treino-Chave", CHAVE))
                .andExpect(status().isOk());
        ObjectNode meta = metadados();
        ajuste.accept(meta);
        var r = enviarResultado(trabalho, meta, true);
        assertThat(r.andReturn().getResponse().getStatus()).as(r.andReturn().getResponse().getContentAsString())
                .isEqualTo(201);
        return corpo(r);
    }

    private long referenciaEmUso() {
        return jdbc.queryForObject("SELECT max(id) FROM referencia_versao WHERE simulado", Long.class);
    }

    private JsonNode diagnostico(String token) throws Exception {
        return corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ia/diagnostico?simulado=true"),
                token)).andExpect(status().isOk()));
    }

    @Test
    void cicloInteiroTreinarAtivarInferirEAparecerNoAlertaENaOs() throws Exception {
        String admin = tokenAdmin();
        prepararReferencia(admin);
        // sem serviço de treino: o trabalho fica pendente, com o comando do notebook
        JsonNode trabalho = treinar(tokenDe("TECNICO"), 202);
        long trabalhoId = trabalho.get("id").asLong();
        assertThat(trabalho.get("estado").asText()).isEqualTo("pendente");
        assertThat(trabalho.get("comando").asText()).contains("python -m analise.treino").contains("--trabalho "
                + trabalhoId);
        treinar(admin, 409); // um em andamento por máquina e tipo de dado
        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/modelos/treinar?simulado=true"),
                tokenDe("OPERADOR"))).andExpect(status().isForbidden());
        JsonNode servico = corpo(mvc.perform(get("/api/v1/treino/servico/trabalhos/" + trabalhoId)
                .header("X-Treino-Chave", CHAVE)).andExpect(status().isOk()));
        assertThat(servico.get("maquina_id").asLong()).isEqualTo(maquinaId);
        assertThat(servico.get("simulado").asBoolean()).isTrue();
        mvc.perform(post("/api/v1/treino/servico/trabalhos/" + trabalhoId + "/inicio").header("X-Treino-Chave", CHAVE))
                .andExpect(status().isOk());
        ObjectNode meta = metadados();
        meta.put("referencia_versao_id", referenciaEmUso());
        JsonNode modelo = corpo(enviarResultado(trabalhoId, meta, true).andExpect(status().isCreated()));
        assertThat(modelo.get("versao").asInt()).isEqualTo(1);
        assertThat(modelo.get("estado").asText()).isEqualTo("candidato");
        assertThat(modelo.get("aviso_simulado").asText()).isEqualTo("dado simulado: não é resultado");
        assertThat(modelo.get("classes")).hasSize(5);
        assertThat(modelo.get("conjunto").get("janelas").asInt()).isEqualTo(450);
        assertThat(modelo.get("f1_macro_por_ensaio").asDouble()).isBetween(0.0, 1.0);
        JsonNode concluido = corpo(mvc.perform(comToken(get("/api/v1/treino/trabalhos/" + trabalhoId), admin)));
        assertThat(concluido.get("estado").asText()).isEqualTo("concluido");
        assertThat(concluido.get("modelo_versao").asInt()).isEqualTo(1);
        assertThat(concluido.get("comando").isNull()).isTrue();
        // resultado de novo no trabalho concluído: 409
        enviarResultado(trabalhoId, meta, true).andExpect(status().isConflict());

        // candidato ainda não roda: nenhuma opinião
        long id = modelo.get("id").asLong();
        assertThat(diagnostico(admin).get("ativo").isNull()).isTrue();
        JsonNode detalhe = corpo(mvc.perform(comToken(get("/api/v1/modelos/" + id), admin)).andExpect(status().isOk()));
        assertThat(detalhe.get("caminho").asText()).isEqualTo("onnx");
        assertThat(detalhe.get("metadados").get("metricas").get("por_ensaio").get("classificador")
                .get("matriz_confusao")).hasSize(5);
        assertThat(detalhe.get("avisos").toString()).contains("dado simulado").doesNotContain("referência mudou");
        assertThat(corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/modelos?simulado=true"), admin)))
                .get("total_elementos").asLong()).isEqualTo(1);
        assertThat(corpo(mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId
                + "/treino/trabalhos?simulado=true"), admin))).get("total_elementos").asLong()).isEqualTo(1);

        // só ADMIN ativa
        mvc.perform(comToken(post("/api/v1/modelos/" + id + "/ativar"), tokenDe("TECNICO")))
                .andExpect(status().isForbidden());
        JsonNode ativado = corpo(mvc.perform(comToken(post("/api/v1/modelos/" + id + "/ativar"), admin))
                .andExpect(status().isOk()));
        assertThat(ativado.get("modelo").get("estado").asText()).isEqualTo("ativo");
        mvc.perform(comToken(post("/api/v1/modelos/" + id + "/ativar"), admin)).andExpect(status().isConflict());

        // severo nos três pontos: a REGRA abre o alerta (3ª janela) e a OS; o modelo só acrescenta a opinião
        Instant t = enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 5, 1120, SEVERO);
        long inferencias = contar("inferencia");
        assertThat(inferencias).isEqualTo(5);
        JsonNode alerta = corpo(mvc.perform(comToken(get("/api/v1/alertas?simulado=true&ponto=A"), admin)))
                .get("conteudo").get(0);
        assertThat(alerta.get("nivel").asText()).isEqualTo("alarme");
        JsonNode abertura = alerta.get("opiniao_abertura");
        assertThat(abertura.get("versao").asInt()).isEqualTo(1);
        assertThat(abertura.get("simulado").asBoolean()).isTrue();
        assertThat(abertura.get("explicacao").asText()).contains("modelo v1");
        assertThat(abertura.get("concordancia").asText()).startsWith("o modelo");
        assertThat(abertura.get("classe").asText()).isIn(ConjuntoTreinoRepository.CLASSES);
        assertThat(abertura.get("confianca").asDouble()).isBetween(0.0, 1.0);
        assertThat(alerta.get("opiniao_recente").get("janela_id").asLong())
                .isGreaterThanOrEqualTo(abertura.get("janela_id").asLong());
        JsonNode os = corpo(mvc.perform(comToken(get("/api/v1/ordens-servico?simulado=true"), admin)))
                .get("conteudo").get(0);
        assertThat(os.get("opiniao_abertura").get("modelo_id").asLong()).isEqualTo(id);
        assertThat(os.get("opiniao_recente").isNull()).isFalse();

        JsonNode diag = diagnostico(admin);
        assertThat(diag.get("roda").asBoolean()).isTrue();
        assertThat(diag.get("ativo").get("versao").asInt()).isEqualTo(1);
        assertThat(diag.get("ultima_hora").get("janelas").asLong()).isEqualTo(5);
        assertThat(diag.get("canais")).isNotEmpty();
        assertThat(diag.get("tendencia_habilitada").asBoolean()).isFalse();
        assertThat(diag.toString()).doesNotContain(CHAVE);

        // janela sem velocidade: a característica que o modelo usa falta, a opinião falha e é contada; a regra
        // avalia a janela normalmente
        long erros = diag.get("erros").asLong();
        long janela = corpo(enviar(DISPOSITIVO_SIM, CHAVE_SIM, payload(DISPOSITIVO_SIM, t))).get("janela_id").asLong();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM avaliacao WHERE janela_id = ?", Long.class, janela))
                .isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inferencia WHERE janela_id = ?", Long.class, janela))
                .isZero();
        assertThat(diagnostico(admin).get("erros").asLong()).isEqualTo(erros + 1);
        assertThat(diagnostico(admin).get("ultimo_erro").asText()).contains("ausente");

        // versão 2 ativada: a 1 vira arquivada
        JsonNode v2 = candidato(admin, m -> m.put("referencia_versao_id", referenciaEmUso()));
        JsonNode ativou = corpo(mvc.perform(comToken(post("/api/v1/modelos/" + v2.get("id").asLong() + "/ativar"),
                admin)).andExpect(status().isOk()));
        assertThat(ativou.get("modelo").get("versao").asInt()).isEqualTo(2);
        assertThat(corpo(mvc.perform(comToken(get("/api/v1/modelos/" + id), admin))).get("modelo").get("estado")
                .asText()).isEqualTo("arquivado");
    }

    @Test
    void referenciaRecalculadaDepoisDoTreinoAvisaECanalExigidoDesabilitadoNaoRoda() throws Exception {
        String admin = tokenAdmin();
        prepararReferencia(admin);
        // treinado com a referência em uso, que depois é recalculada: roda, mas avisa
        long usada = referenciaEmUso();
        JsonNode antigo = candidato(admin, m -> m.put("referencia_versao_id", usada).put("referencia_numero", 1));
        mvc.perform(comToken(post("/api/v1/modelos/" + antigo.get("id").asLong() + "/ativar"), admin))
                .andExpect(status().isOk());
        assertThat(diagnostico(admin).get("avisos").toString()).doesNotContain("referência mudou");
        recalcular(admin);
        JsonNode diag = diagnostico(admin);
        assertThat(diag.get("roda").asBoolean()).isTrue();
        assertThat(diag.get("avisos").toString()).contains("referência mudou: treine de novo");

        // exige um canal desabilitado na fusão: não roda e o Diagnóstico diz por quê
        JsonNode comCanal = candidato(admin, m -> {
            m.put("referencia_versao_id", referenciaEmUso());
            ((ArrayNode) m.putArray("canais")).add("nivel_som_db");
        });
        mvc.perform(comToken(post("/api/v1/modelos/" + comCanal.get("id").asLong() + "/ativar"), admin))
                .andExpect(status().isOk());
        diag = diagnostico(admin);
        assertThat(diag.get("roda").asBoolean()).isFalse();
        assertThat(diag.get("motivo_nao_roda").asText()).contains("nivel_som_db").contains("desabilitado");
        enviarSequencia(Instant.now().truncatedTo(ChronoUnit.SECONDS), 3, 1120, CORTE);
        assertThat(contar("inferencia")).isZero();
        assertThat(contar("avaliacao")).isPositive();
        assertThat(corpo(mvc.perform(comToken(get("/api/v1/modelos/" + comCanal.get("id").asLong()), admin)))
                .get("avisos").toString()).contains("não roda");
    }

    @Test
    void resultadoInvalidoERecusadoEOTrabalhoFalha() throws Exception {
        String admin = tokenAdmin();
        long trabalho = treinar(admin, 202).get("id").asLong();
        ObjectNode meta = metadados();
        meta.put("versao_vetor", "v0");
        assertThat(corpo(enviarResultado(trabalho, meta, true).andExpect(status().isBadRequest())).get("mensagem")
                .asText()).contains("v0");
        JsonNode t = corpo(mvc.perform(comToken(get("/api/v1/treino/trabalhos/" + trabalho), admin)));
        assertThat(t.get("estado").asText()).isEqualTo("falhou");
        assertThat(t.get("mensagem").asText()).contains("resultado recusado");

        // classes sem o arquivo do classificador
        long outro = treinar(admin, 202).get("id").asLong();
        enviarResultado(outro, metadados(), false).andExpect(status().isBadRequest());
        // referência que a API não conhece
        long quinto = treinar(admin, 202).get("id").asLong();
        assertThat(corpo(enviarResultado(quinto, metadados().put("referencia_versao_id", 987654L), true)
                .andExpect(status().isBadRequest())).get("mensagem").asText()).contains("referência");
        // modelo de dado real num trabalho simulado
        long terceiro = treinar(admin, 202).get("id").asLong();
        enviarResultado(terceiro, metadados().put("simulado", false), true).andExpect(status().isBadRequest());
        // arquivo vazio, grande demais, metadados ilegíveis, sem características, classes que não batem
        long sexto = treinar(admin, 202).get("id").asLong();
        assertThat(corpo(mvc.perform(multipart("/api/v1/treino/servico/trabalhos/" + sexto + "/resultado")
                .file(new MockMultipartFile("anomalia", "a.onnx", "application/octet-stream", new byte[0]))
                .file(new MockMultipartFile("metadados", "m.json", "application/json", json.writeValueAsBytes(metadados())))
                .header("X-Treino-Chave", CHAVE)).andExpect(status().isBadRequest())).get("mensagem").asText())
                .contains("faltam arquivos");
        long setimo = treinar(admin, 202).get("id").asLong();
        assertThat(corpo(mvc.perform(multipart("/api/v1/treino/servico/trabalhos/" + setimo + "/resultado")
                .file(new MockMultipartFile("anomalia", "a.onnx", "application/octet-stream",
                        new byte[5 * 1024 * 1024 + 10]))
                .file(new MockMultipartFile("metadados", "m.json", "application/json", json.writeValueAsBytes(metadados())))
                .header("X-Treino-Chave", CHAVE)).andExpect(status().isBadRequest())).get("mensagem").asText())
                .contains("máximo");
        long oitavo = treinar(admin, 202).get("id").asLong();
        assertThat(corpo(mvc.perform(multipart("/api/v1/treino/servico/trabalhos/" + oitavo + "/resultado")
                .file(new MockMultipartFile("anomalia", "a.onnx", "application/octet-stream",
                        Files.readAllBytes(FIXTURE.resolve("anomalia.onnx"))))
                .file(new MockMultipartFile("metadados", "m.json", "application/json", "{quebrado".getBytes()))
                .header("X-Treino-Chave", CHAVE)).andExpect(status().isBadRequest())).get("mensagem").asText())
                .contains("metadados ilegíveis");
        long nono = treinar(admin, 202).get("id").asLong();
        ObjectNode semCaracteristicas = metadados();
        semCaracteristicas.putArray("caracteristicas");
        enviarResultado(nono, semCaracteristicas, true).andExpect(status().isBadRequest());
        long decimo = treinar(admin, 202).get("id").asLong();
        ObjectNode tresClasses = metadados();
        ((ArrayNode) tresClasses.putArray("classes")).add("normal").add("avanco_excessivo").add("desbalanceamento");
        assertThat(corpo(enviarResultado(decimo, tresClasses, true).andExpect(status().isBadRequest()))
                .get("mensagem").asText()).contains("probabilidades");
        // falha relatada pelo serviço
        long quarto = treinar(admin, 202).get("id").asLong();
        JsonNode falhou = corpo(mvc.perform(post("/api/v1/treino/servico/trabalhos/" + quarto + "/falha")
                .header("X-Treino-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("mensagem", "sem janela normal")))).andExpect(status().isOk()));
        assertThat(falhou.get("mensagem").asText()).contains("sem janela normal");
        mvc.perform(post("/api/v1/treino/servico/trabalhos/" + quarto + "/inicio").header("X-Treino-Chave", CHAVE))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/treino/servico/trabalhos/999999/inicio").header("X-Treino-Chave", CHAVE))
                .andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/modelos/999999"), admin)).andExpect(status().isNotFound());
        mvc.perform(comToken(post("/api/v1/modelos/999999/ativar"), admin)).andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/treino/trabalhos/999999"), admin)).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/treino/servico/trabalhos/999999/falha").header("X-Treino-Chave", CHAVE)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
        mvc.perform(comToken(post("/api/v1/maquinas/999999/modelos/treinar"), admin)).andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/ia/diagnostico"), admin)).andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/treino/trabalhos"), admin)).andExpect(status().isNotFound());
        mvc.perform(comToken(get("/api/v1/maquinas/999999/modelos"), admin)).andExpect(status().isNotFound());
    }

    @Test
    void trabalhoQuePassouDoPrazoFalha() throws Exception {
        String admin = tokenAdmin();
        long trabalho = treinar(admin, 202).get("id").asLong();
        jdbc.update("UPDATE trabalho_treino SET criado_em = now() - interval '2 hours' WHERE id = ?", trabalho);
        treinoService.vencerAtrasados();
        JsonNode t = corpo(mvc.perform(comToken(get("/api/v1/treino/trabalhos/" + trabalho), admin)));
        assertThat(t.get("estado").asText()).isEqualTo("falhou");
        assertThat(t.get("mensagem").asText()).contains("prazo");
        // depois da falha, pode treinar de novo
        treinar(admin, 202);
    }

    @org.springframework.beans.factory.annotation.Autowired
    private TreinoService treinoService;
}
