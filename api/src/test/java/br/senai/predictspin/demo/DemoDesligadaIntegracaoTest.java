package br.senai.predictspin.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import br.senai.predictspin.IntegracaoBase;

/** Padrão de produção: sem PS_DEMO_HABILITADO as rotas não existem e o gerador não faz nada. */
class DemoDesligadaIntegracaoTest extends IntegracaoBase {

    @Autowired
    DemoService demo;

    @Test
    void desligadaAsRotasRespondem404ParaOAdminENadaEGerado() throws Exception {
        String token = tokenAdmin();
        mvc.perform(comToken(get("/api/v1/demo/estado"), token)).andExpect(status().isNotFound());
        mvc.perform(comToken(post("/api/v1/demo/cenario"), token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nivel\":\"ALARME\"}")).andExpect(status().isNotFound());
        mvc.perform(comToken(post("/api/v1/demo/zerar"), token)).andExpect(status().isNotFound());
        assertThat(demo.habilitado()).isFalse();
        demo.passo();
        assertThat(contar("janela")).isZero();
    }

    @Test
    void desligadaQuemNaoEAdminAindaRecebe403() throws Exception {
        mvc.perform(comToken(get("/api/v1/demo/estado"), tokenDe("TECNICO"))).andExpect(status().isForbidden());
    }
}
