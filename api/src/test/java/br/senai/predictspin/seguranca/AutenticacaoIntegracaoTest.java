package br.senai.predictspin.seguranca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import br.senai.predictspin.IntegracaoBase;

class AutenticacaoIntegracaoTest extends IntegracaoBase {

    @Test
    void loginCorretoDevolveTokenQueAbreRotaProtegida() throws Exception {
        var resposta = login(ADMIN_EMAIL, ADMIN_SENHA, ipNovo())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.tipo").value("Bearer"))
                .andExpect(jsonPath("$.expira_em", notNullValue()))
                .andExpect(jsonPath("$.usuario.papel").value("ADMIN"))
                .andExpect(jsonPath("$.usuario.senha_hash").doesNotExist());
        String token = corpo(resposta).get("token").asText();

        mvc.perform(comToken(get("/api/v1/maquinas"), token)).andExpect(status().isOk());
    }

    @Test
    void emailEhNormalizadoNoLogin() throws Exception {
        login("  ADMIN@Teste.Local ", ADMIN_SENHA, ipNovo()).andExpect(status().isOk());
    }

    @Test
    void senhaErradaResponde401ComMensagemGenerica() throws Exception {
        login(ADMIN_EMAIL, "senha-errada", ipNovo())
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.mensagem").value("E-mail ou senha inválidos"))
                .andExpect(jsonPath("$.caminho").value("/api/v1/auth/login"))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void emailInexistenteResponde401IgualASenhaErrada() throws Exception {
        login("ninguem@teste.local", "qualquer-coisa", ipNovo())
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.mensagem").value("E-mail ou senha inválidos"));
    }

    @Test
    void corpoSemSenhaResponde400() throws Exception {
        mvc.perform(post("/api/v1/auth/login").with(ipNovo()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@teste.local\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("senha"));
    }

    @Test
    void usuarioDesativadoNaoConsegueEntrar() throws Exception {
        String admin = tokenAdmin();
        var criado = corpo(mvc.perform(comToken(post("/api/v1/usuarios"), admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"Op\",\"email\":\"op.desativado@teste.local\",\"senha\":\"SenhaForte123\",\"papel\":\"OPERADOR\"}"))
                .andExpect(status().isCreated()));
        login("op.desativado@teste.local", "SenhaForte123", ipNovo()).andExpect(status().isOk());

        mvc.perform(comToken(post("/api/v1/usuarios/" + criado.get("id").asLong() + "/desativar"), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));

        login("op.desativado@teste.local", "SenhaForte123", ipNovo()).andExpect(status().isUnauthorized());
    }

    @Test
    void limitePorEmailResponde429ComRetryAfterMesmoComSenhaCerta() throws Exception {
        String email = "alvo.limite@teste.local";
        for (int i = 0; i < 3; i++) {
            login(email, "errada-" + i, ipNovo()).andExpect(status().isUnauthorized());
        }
        login(email, "qualquer", ipNovo())
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", notNullValue()))
                .andExpect(jsonPath("$.status").value(429));
        // O bloqueio é do e-mail: o administrador continua entrando
        login(ADMIN_EMAIL, ADMIN_SENHA, ipNovo()).andExpect(status().isOk());
    }

    @Test
    void limitePorIpResponde429ParaQualquerEmail() throws Exception {
        String ipAtacante = "192.0.2.77";
        for (int i = 0; i < 6; i++) {
            login("varredura" + i + "@teste.local", "errada", ip(ipAtacante)).andExpect(status().isUnauthorized());
        }
        login(ADMIN_EMAIL, ADMIN_SENHA, ip(ipAtacante)).andExpect(status().isTooManyRequests());
        login(ADMIN_EMAIL, ADMIN_SENHA, ipNovo()).andExpect(status().isOk());
    }

    @Test
    void tokenInvalidoOuAusenteResponde401Padronizado() throws Exception {
        mvc.perform(get("/api/v1/maquinas"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        mvc.perform(get("/api/v1/maquinas").header("Authorization", "Bearer nao.e.um.jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthESwaggerSaoPublicosEActuatorNaoExpoeOutrosEndpoints() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
        var env = mvc.perform(get("/actuator/env")).andReturn().getResponse().getStatus();
        assertThat(env).isIn(401, 403, 404);
    }

    @Test
    void respostasTrazemCabecalhosDeSeguranca() throws Exception {
        login(ADMIN_EMAIL, ADMIN_SENHA, ipNovo())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }
}
