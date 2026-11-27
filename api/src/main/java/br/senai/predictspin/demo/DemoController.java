package br.senai.predictspin.demo;

import jakarta.validation.Valid;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.demo.dto.CenarioDemoRequisicao;
import br.senai.predictspin.demo.dto.EstadoDemoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Barra de demonstração: só ADMIN, e só com ps.demo.habilitado (senão 404). Dados sempre simulados. */
@RestController
@RequestMapping("/api/v1/demo")
@Tag(name = "Demonstração", description = "Nível da vibração simulada para a apresentação (desligado por padrão)")
public class DemoController {

    private final DemoService demo;

    public DemoController(DemoService demo) {
        this.demo = demo;
    }

    @GetMapping("/estado")
    @Operation(summary = "Estado da demonstração",
            description = "Nível atual, tempo até voltar a NORMAL, se há referência para a marcha da demonstração "
                    + "e se há hardware real enviando. Só ADMIN; 404 com a demonstração desligada.")
    @ApiResponse(responseCode = "200", description = "Estado da demonstração")
    @ApiResponse(responseCode = "404", description = "Demonstração desligada neste ambiente")
    public EstadoDemoResposta estado() {
        return demo.estado();
    }

    @PostMapping("/cenario")
    @Operation(summary = "Troca o nível da vibração simulada",
            description = "PARADA, NORMAL, ATENCAO ou ALARME. As janelas saem do dispositivo simulado, marcadas "
                    + "como demonstração, e passam pela mesma avaliação, alerta e OS de uma janela real. Sem "
                    + "referência ativa na marcha da demonstração, o nível fica PARADA e a mensagem diz o que falta.")
    @ApiResponse(responseCode = "200", description = "Estado depois da troca")
    @ApiResponse(responseCode = "404", description = "Demonstração desligada neste ambiente")
    public EstadoDemoResposta cenario(@Valid @RequestBody CenarioDemoRequisicao requisicao,
                                      Authentication autenticacao) {
        return demo.definir(requisicao.nivel(), quem(autenticacao));
    }

    /** "id 1 (Nome)": só o necessário para o log, nunca o e-mail nem o token. */
    private static String quem(Authentication autenticacao) {
        if (autenticacao != null && autenticacao.getPrincipal() instanceof Jwt jwt) {
            String nome = jwt.getClaimAsString("nome");
            return "id " + jwt.getSubject() + (nome == null ? "" : " (" + nome + ")");
        }
        return autenticacao == null ? "desconhecido" : autenticacao.getName();
    }
}
