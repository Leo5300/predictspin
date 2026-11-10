package br.senai.predictspin.seguranca;

import jakarta.validation.Valid;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.seguranca.dto.NovoUsuarioRequisicao;
import br.senai.predictspin.seguranca.dto.UsuarioResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/usuarios")
@Tag(name = "Usuários", description = "Cadastro de usuários. Somente ADMIN.")
public class UsuarioController {

    private final UsuarioService servico;

    public UsuarioController(UsuarioService servico) {
        this.servico = servico;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Cria usuário (ADMIN, TECNICO ou OPERADOR)")
    public UsuarioResposta criar(@Valid @RequestBody NovoUsuarioRequisicao requisicao) {
        return servico.criar(requisicao);
    }

    @GetMapping
    @Operation(summary = "Lista usuários, paginado (page, size)")
    public Pagina<UsuarioResposta> listar(@Parameter(hidden = true) @PageableDefault(size = 20) Pageable pageable) {
        return servico.listar(PageRequest.of(pageable.getPageNumber(), pageable.getPageSize()));
    }

    @PostMapping("/{id}/desativar")
    @Operation(summary = "Desativa usuário: ele deixa de conseguir entrar")
    public UsuarioResposta desativar(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return servico.desativar(id, Long.valueOf(jwt.getSubject()));
    }
}
