package br.senai.predictspin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Base dos testes de integração: API inteira (MockMvc) sobre PostgreSQL real do Testcontainers.
 * Antes de cada teste apaga janelas, ensaios e usuários criados, mantendo os dados iniciais.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("teste")
public abstract class IntegracaoBase {

    protected static final String ADMIN_EMAIL = "admin@teste.local";
    protected static final String ADMIN_SENHA = "SenhaAdmin123";
    protected static final String DISPOSITIVO_REAL = "ps-torno-01";
    protected static final String CHAVE_REAL = "chave-real-teste";
    protected static final String DISPOSITIVO_SIM = "ps-sim-01";
    protected static final String CHAVE_SIM = "chave-sim-teste";

    /** Cada login usa um IP diferente, para o limite por IP de um teste não afetar outro. */
    private static final AtomicInteger PROXIMO_IP = new AtomicInteger(1);

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected JdbcTemplate jdbc;

    protected Long maquinaId;

    @BeforeEach
    void limparBase() {
        jdbc.update("DELETE FROM leitura");
        jdbc.update("DELETE FROM telemetria");
        jdbc.update("DELETE FROM janela");
        jdbc.update("DELETE FROM ensaio");
        jdbc.update("DELETE FROM usuario WHERE email <> ?", ADMIN_EMAIL);
        jdbc.update("UPDATE usuario SET ativo = true");
        jdbc.update("UPDATE dispositivo SET ultimo_contato = NULL, ativo = true");
        maquinaId = jdbc.queryForObject("SELECT id FROM maquina WHERE codigo = 'TORNO-01'", Long.class);
    }

    // ---------------------------------------------------------------- usuários

    protected static RequestPostProcessor ipNovo() {
        String ip = "10.1." + (PROXIMO_IP.get() / 250) + "." + (PROXIMO_IP.getAndIncrement() % 250 + 1);
        return requisicao -> {
            requisicao.setRemoteAddr(ip);
            return requisicao;
        };
    }

    protected static RequestPostProcessor ip(String ip) {
        return requisicao -> {
            requisicao.setRemoteAddr(ip);
            return requisicao;
        };
    }

    protected ResultActions login(String email, String senha, RequestPostProcessor ip) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").with(ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "senha", senha))));
    }

    protected String token(String email, String senha) throws Exception {
        String corpo = login(email, senha, ipNovo()).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(corpo).get("token").asText();
    }

    protected String tokenAdmin() throws Exception {
        return token(ADMIN_EMAIL, ADMIN_SENHA);
    }

    /** Cria um usuário com o papel dado (via API, como ADMIN) e devolve o token dele. */
    protected String tokenDe(String papel) throws Exception {
        String email = papel.toLowerCase() + "." + System.nanoTime() + "@teste.local";
        mvc.perform(comToken(post("/api/v1/usuarios"), tokenAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("nome", "Usuário " + papel, "email", email,
                                "senha", "SenhaForte123", "papel", papel))))
                .andExpect(status().isCreated());
        return token(email, "SenhaForte123");
    }

    protected static MockHttpServletRequestBuilder comToken(MockHttpServletRequestBuilder req, String token) {
        return req.header("Authorization", "Bearer " + token);
    }

    // ---------------------------------------------------------------- telemetria

    protected static Map<String, Object> medida(double rms) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rms_g", rms);
        m.put("pico_g", rms * 3);
        m.put("curtose", 3.0);
        m.put("o1x", rms * 0.6);
        m.put("o2x", rms * 0.2);
        m.put("o3x", rms * 0.1);
        return m;
    }

    protected static Map<String, Object> payload(String dispositivo, Instant medidoEm) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("dispositivo", dispositivo);
        p.put("medido_em", medidoEm.toString());
        p.put("rotacao_rpm", 1200.0);
        p.put("saturou", false);
        p.put("pontos", new LinkedHashMap<>(Map.of("A", medida(0.10), "B", medida(0.20), "C", medida(0.05))));
        p.put("canais", new LinkedHashMap<>(Map.of("temp_cabecote_c", 31.5, "temp_ferramenta_c", 35.0,
                "amb_temp_c", 24.0, "amb_umid_pct", 55.0, "corrente_a", 4.2)));
        return p;
    }

    protected ResultActions enviar(String dispositivo, String chave, Object corpo) throws Exception {
        return mvc.perform(post("/api/v1/telemetria")
                .header("X-Dispositivo-Id", dispositivo)
                .header("X-Dispositivo-Chave", chave)
                .contentType(MediaType.APPLICATION_JSON)
                .content(corpo instanceof String s ? s : json.writeValueAsString(corpo)));
    }

    protected ResultActions enviarSimulado(Instant medidoEm) throws Exception {
        return enviar(DISPOSITIVO_SIM, CHAVE_SIM, payload(DISPOSITIVO_SIM, medidoEm));
    }

    protected ResultActions enviarReal(Instant medidoEm) throws Exception {
        return enviar(DISPOSITIVO_REAL, CHAVE_REAL, payload(DISPOSITIVO_REAL, medidoEm));
    }

    // ---------------------------------------------------------------- utilidades

    protected JsonNode corpo(ResultActions resultado) throws Exception {
        return json.readTree(resultado.andReturn().getResponse().getContentAsString());
    }

    protected long contar(String tabela) {
        return jdbc.queryForObject("SELECT count(*) FROM " + tabela, Long.class);
    }
}
