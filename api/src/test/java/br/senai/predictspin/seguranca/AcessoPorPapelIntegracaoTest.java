package br.senai.predictspin.seguranca;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import br.senai.predictspin.IntegracaoBase;

class AcessoPorPapelIntegracaoTest extends IntegracaoBase {

    private static final String NOVO_ENSAIO = "{\"etapa\":\"T1\",\"condicao\":\"normal\",\"rotacao_alvo_rpm\":800}";

    @Test
    void operadorConsultaMasNaoAbreEnsaioNemGerenciaUsuarios() throws Exception {
        String operador = tokenDe("OPERADOR");

        mvc.perform(comToken(get("/api/v1/maquinas"), operador)).andExpect(status().isOk());
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/pontos"), operador)).andExpect(status().isOk());

        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), operador)
                        .contentType(MediaType.APPLICATION_JSON).content(NOVO_ENSAIO))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/ensaios"), operador))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(get("/api/v1/ensaios/exportar.csv"), operador)).andExpect(status().isForbidden());
        mvc.perform(comToken(get("/api/v1/maquinas/" + maquinaId + "/coleta/cobertura"), operador))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(get("/api/v1/usuarios"), operador)).andExpect(status().isForbidden());
    }

    @Test
    void tecnicoAbreEnsaioMasNaoGerenciaUsuarios() throws Exception {
        String tecnico = tokenDe("TECNICO");

        mvc.perform(comToken(post("/api/v1/maquinas/" + maquinaId + "/ensaios"), tecnico)
                        .contentType(MediaType.APPLICATION_JSON).content(NOVO_ENSAIO))
                .andExpect(status().isCreated());
        mvc.perform(comToken(get("/api/v1/usuarios"), tecnico)).andExpect(status().isForbidden());
        mvc.perform(comToken(post("/api/v1/usuarios"), tecnico).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"X\",\"email\":\"x@teste.local\",\"senha\":\"SenhaForte123\",\"papel\":\"ADMIN\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCriaListaPaginadoEDesativaUsuarios() throws Exception {
        String admin = tokenAdmin();
        for (int i = 0; i < 3; i++) {
            mvc.perform(comToken(post("/api/v1/usuarios"), admin).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"nome\":\"Usuário " + i + "\",\"email\":\"Lista" + i + "@Teste.local\","
                                    + "\"senha\":\"SenhaForte123\",\"papel\":\"OPERADOR\"}"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.email").value("lista" + i + "@teste.local"))
                    .andExpect(jsonPath("$.senha").doesNotExist())
                    .andExpect(jsonPath("$.senha_hash").doesNotExist());
        }

        mvc.perform(comToken(get("/api/v1/usuarios?page=0&size=2"), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conteudo.length()").value(2))
                .andExpect(jsonPath("$.total_elementos").value(4))
                .andExpect(jsonPath("$.total_paginas").value(2))
                .andExpect(jsonPath("$.tamanho").value(2));
        mvc.perform(comToken(get("/api/v1/usuarios?page=1&size=2"), admin))
                .andExpect(jsonPath("$.conteudo.length()").value(2))
                .andExpect(jsonPath("$.pagina").value(1));
    }

    @Test
    void emailDuplicadoResponde409() throws Exception {
        String admin = tokenAdmin();
        String corpo = "{\"nome\":\"Dup\",\"email\":\"dup@teste.local\",\"senha\":\"SenhaForte123\",\"papel\":\"TECNICO\"}";
        mvc.perform(comToken(post("/api/v1/usuarios"), admin).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated());
        mvc.perform(comToken(post("/api/v1/usuarios"), admin).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isConflict());
    }

    @Test
    void usuarioInvalidoResponde400ComCampos() throws Exception {
        mvc.perform(comToken(post("/api/v1/usuarios"), tokenAdmin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"\",\"email\":\"nao-e-email\",\"senha\":\"curta\",\"papel\":\"OPERADOR\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos.length()").value(3));
        mvc.perform(comToken(post("/api/v1/usuarios"), tokenAdmin()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"A\",\"email\":\"a@teste.local\",\"senha\":\"SenhaForte123\",\"papel\":\"CHEFE\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminNaoDesativaASiMesmoEDesativarInexistenteResponde404() throws Exception {
        String admin = tokenAdmin();
        Long adminId = jdbc.queryForObject("SELECT id FROM usuario WHERE email = ?", Long.class, ADMIN_EMAIL);
        mvc.perform(comToken(post("/api/v1/usuarios/" + adminId + "/desativar"), admin))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(post("/api/v1/usuarios/999999/desativar"), admin))
                .andExpect(status().isNotFound());
    }

    @Test
    void tokenDeUsuarioNaoServeParaEnviarTelemetria() throws Exception {
        mvc.perform(comToken(post("/api/v1/telemetria"), tokenAdmin()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(payload(DISPOSITIVO_SIM, java.time.Instant.now()))))
                .andExpect(status().isUnauthorized());
    }
}
