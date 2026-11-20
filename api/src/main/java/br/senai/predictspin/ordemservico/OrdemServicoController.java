package br.senai.predictspin.ordemservico;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.ordemservico.dto.ConclusaoRequisicao;
import br.senai.predictspin.ordemservico.dto.OrdemServicoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Validated
@RequestMapping("/api/v1/ordens-servico")
@Tag(name = "Ordens de serviço", description = "OS abertas pela regra; assumir e concluir só ADMIN e TECNICO")
public class OrdemServicoController {

    private final OrdemServicoService ordens;

    public OrdemServicoController(OrdemServicoService ordens) {
        this.ordens = ordens;
    }

    @GetMapping
    @Operation(summary = "Lista OS, abertas e em andamento primeiro, paginado e com filtros")
    public Pagina<OrdemServicoResposta> listar(
            @RequestParam(name = "maquina_id", required = false) Long maquinaId,
            @Parameter(description = "aberta, em_andamento, concluida ou cancelada")
            @RequestParam(required = false) StatusOrdemServico status,
            @Parameter(description = "Código do ponto (A, B, C)") @RequestParam(required = false) String ponto,
            @RequestParam(required = false) Boolean simulado,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return ordens.listar(new OrdemServicoSql.Filtro(maquinaId, status, ponto, simulado), page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detalha uma OS")
    public OrdemServicoResposta buscar(@PathVariable Long id) {
        return ordens.buscar(id);
    }

    @PostMapping("/{id}/assumir")
    @Operation(summary = "Assume a OS (fica em andamento, com o usuário como responsável)")
    @ApiResponse(responseCode = "200", description = "OS em andamento")
    @ApiResponse(responseCode = "409", description = "OS não está aberta")
    public OrdemServicoResposta assumir(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return ordens.assumir(id, Long.parseLong(jwt.getSubject()));
    }

    @PostMapping("/{id}/concluir")
    @Operation(summary = "Conclui a OS com o retorno do técnico",
            description = "confirmada: havia problema; rejeitada: falso positivo. O retorno fica guardado na OS e "
                    + "no alerta de origem, como rótulo para o treino; a condição encontrada (opcional) diz qual classe.")
    @ApiResponse(responseCode = "200", description = "OS concluída")
    @ApiResponse(responseCode = "409", description = "OS já concluída ou cancelada")
    public OrdemServicoResposta concluir(@PathVariable Long id, @Valid @RequestBody ConclusaoRequisicao requisicao,
                                         @AuthenticationPrincipal Jwt jwt) {
        return ordens.concluir(id, Long.parseLong(jwt.getSubject()), requisicao.retorno(), requisicao.comentario(),
                requisicao.condicaoEncontrada());
    }
}
