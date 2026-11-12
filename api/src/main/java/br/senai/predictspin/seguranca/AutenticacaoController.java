package br.senai.predictspin.seguranca;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.seguranca.dto.LoginRequisicao;
import br.senai.predictspin.seguranca.dto.LoginResposta;
import br.senai.predictspin.seguranca.dto.UsuarioResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Autenticação")
public class AutenticacaoController {

    private final AutenticacaoService servico;

    public AutenticacaoController(AutenticacaoService servico) {
        this.servico = servico;
    }

    @PostMapping("/login")
    @SecurityRequirements
    @Operation(summary = "Entra com e-mail e senha e recebe um JWT",
            description = "Falhas seguidas do mesmo IP ou e-mail são limitadas: ao atingir o limite a resposta é 429 com Retry-After.")
    @ApiResponse(responseCode = "200", description = "Token emitido")
    @ApiResponse(responseCode = "401", description = "E-mail ou senha inválidos, ou usuário inativo")
    @ApiResponse(responseCode = "429", description = "Muitas tentativas com falha")
    public LoginResposta entrar(@Valid @RequestBody LoginRequisicao requisicao, HttpServletRequest req) {
        return servico.entrar(requisicao, req.getRemoteAddr());
    }

    @GetMapping("/eu")
    @Operation(summary = "Devolve o usuário dono do token",
            description = "Serve para o painel validar a sessão ao abrir. Token vencido ou de usuário desativado "
                    + "responde 401.")
    @ApiResponse(responseCode = "200", description = "Usuário do token")
    @ApiResponse(responseCode = "401", description = "Token ausente, inválido ou de usuário desativado")
    public UsuarioResposta eu(@AuthenticationPrincipal Jwt jwt) {
        return servico.eu(Long.valueOf(jwt.getSubject()));
    }
}
