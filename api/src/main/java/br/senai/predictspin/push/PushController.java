package br.senai.predictspin.push;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.push.dto.AparelhoRequisicao;
import br.senai.predictspin.push.dto.AparelhoResposta;
import br.senai.predictspin.push.dto.PushDiagnosticoResposta;
import br.senai.predictspin.push.dto.RemoverAparelhoRequisicao;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/push")
@Tag(name = "Push", description = "Aparelhos que recebem notificação de alarme e contadores do envio")
public class PushController {

    private final PushService push;

    public PushController(PushService push) {
        this.push = push;
    }

    @PutMapping("/aparelhos")
    @Operation(operationId = "registrarAparelho",
            summary = "Registra ou atualiza o aparelho do próprio usuário (token de push do Expo)",
            description = "O mesmo token com outro usuário passa a ser deste (outra pessoa entrou no mesmo celular).")
    @ApiResponse(responseCode = "200", description = "Aparelho registrado")
    @ApiResponse(responseCode = "400", description = "Token ou plataforma inválidos")
    public AparelhoResposta registrarAparelho(@Valid @RequestBody AparelhoRequisicao requisicao,
                                              @AuthenticationPrincipal Jwt jwt) {
        return push.registrar(Long.parseLong(jwt.getSubject()), requisicao.token(), requisicao.plataforma());
    }

    @PostMapping("/aparelhos/remover")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "removerAparelho", summary = "Remove o aparelho do próprio usuário (ao sair do app)",
            description = "Responde 204 mesmo se o token não existe ou é de outro usuário (nada é revelado).")
    @ApiResponse(responseCode = "204", description = "Removido (ou já não existia)")
    public void removerAparelho(@Valid @RequestBody RemoverAparelhoRequisicao requisicao,
                                @AuthenticationPrincipal Jwt jwt) {
        push.remover(Long.parseLong(jwt.getSubject()), requisicao.token());
    }

    @GetMapping("/diagnostico")
    @Operation(operationId = "diagnosticoPush", summary = "Contadores do push desde que a API iniciou (só ADMIN)")
    public PushDiagnosticoResposta diagnosticoPush() {
        return push.diagnostico();
    }
}
