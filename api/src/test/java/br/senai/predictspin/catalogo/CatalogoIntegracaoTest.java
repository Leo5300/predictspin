package br.senai.predictspin.catalogo;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import br.senai.predictspin.IntegracaoBase;

class CatalogoIntegracaoTest extends IntegracaoBase {

    private String tecnico;
    private String admin;

    @BeforeEach
    void preparar() throws Exception {
        tecnico = tokenDe("TECNICO");
        admin = tokenAdmin();
    }

    private long criar(String rota, String token, String nome) throws Exception {
        return corpo(mvc.perform(comToken(post(rota), token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"" + nome + "\"}"))
                .andExpect(status().isCreated())).get("id").asLong();
    }

    @Test
    void comecaVazioETecnicoCriaMaterial() throws Exception {
        mvc.perform(comToken(get("/api/v1/materiais"), tecnico))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_elementos").value(0));
        mvc.perform(comToken(post("/api/v1/materiais"), tecnico).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"  Aço SAE  1045 \",\"descricao\":\"barra redonda\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.nome").value("Aço SAE 1045"))
                .andExpect(jsonPath("$.nome_normalizado").value("aco sae 1045"))
                .andExpect(jsonPath("$.descricao").value("barra redonda"))
                .andExpect(jsonPath("$.ativo").value(true))
                .andExpect(jsonPath("$.criado_por").isNumber());
    }

    @Test
    void nomeDuplicadoPeloNormalizadoResponde409ComOExistente() throws Exception {
        long id = criar("/api/v1/ferramentas", tecnico, "Bit de metal duro 60°");
        mvc.perform(comToken(post("/api/v1/ferramentas"), tecnico).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"bit de METAL-duro 60\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.mensagem").exists())
                .andExpect(jsonPath("$.existente.id").value(id))
                .andExpect(jsonPath("$.existente.nome").value("Bit de metal duro 60°"));
    }

    @Test
    void buscaIgnoraAcentoEMaiusculaEFiltraAtivos() throws Exception {
        criar("/api/v1/materiais", tecnico, "Aço SAE 1045");
        long latao = criar("/api/v1/materiais", tecnico, "Latão");
        criar("/api/v1/materiais", tecnico, "Alumínio 6351");
        mvc.perform(comToken(post("/api/v1/materiais/" + latao + "/desativar"), admin)).andExpect(status().isOk());

        mvc.perform(comToken(get("/api/v1/materiais?busca=ACO"), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(1))
                .andExpect(jsonPath("$.conteudo[0].nome").value("Aço SAE 1045"));
        mvc.perform(comToken(get("/api/v1/materiais?ativos=true"), tecnico))
                .andExpect(jsonPath("$.total_elementos").value(2));
        mvc.perform(comToken(get("/api/v1/materiais?ativos=false"), tecnico))
                .andExpect(jsonPath("$.conteudo[0].nome").value("Latão"));
    }

    @Test
    void renomearEDesativarSoAdmin() throws Exception {
        long id = criar("/api/v1/materiais", tecnico, "aco 1045");
        long outro = criar("/api/v1/materiais", tecnico, "Latão");
        mvc.perform(comToken(patch("/api/v1/materiais/" + id), tecnico).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"Aço SAE 1045\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(comToken(post("/api/v1/materiais/" + id + "/desativar"), tecnico))
                .andExpect(status().isForbidden());

        mvc.perform(comToken(patch("/api/v1/materiais/" + id), admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"Aço SAE 1045\",\"descricao\":\"trefilado\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Aço SAE 1045"))
                .andExpect(jsonPath("$.descricao").value("trefilado"));
        // renomear para o nome de outro item: 409 com o outro
        mvc.perform(comToken(patch("/api/v1/materiais/" + id), admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"latao\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.existente.id").value(outro));
        mvc.perform(comToken(post("/api/v1/materiais/" + id + "/desativar"), admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));
        mvc.perform(comToken(patch("/api/v1/materiais/999999"), admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"x\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void operadorNaoVeCatalogoENomeSoDePontuacaoEhInvalido() throws Exception {
        String operador = tokenDe("OPERADOR");
        mvc.perform(comToken(get("/api/v1/materiais"), operador)).andExpect(status().isForbidden());
        mvc.perform(comToken(get("/api/v1/ferramentas"), operador)).andExpect(status().isForbidden());
        mvc.perform(comToken(post("/api/v1/materiais"), tecnico).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"---\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(post("/api/v1/materiais"), tecnico).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"\"}"))
                .andExpect(status().isBadRequest());
    }
}
