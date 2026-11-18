package br.senai.predictspin.referencia;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.referencia.dto.ReferenciaResposta;
import br.senai.predictspin.referencia.dto.VersaoReferenciaResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Validated
@RequestMapping("/api/v1/maquinas/{id}/referencias")
@Tag(name = "Referência", description = "O normal aprendido de cada ponto, por marcha, etapa e receita")
public class ReferenciaController {

    private final ReferenciaService referencias;

    public ReferenciaController(ReferenciaService referencias) {
        this.referencias = referencias;
    }

    @GetMapping
    @Operation(summary = "Referência em uso: versão, células e cobertura por marcha e etapa")
    public ReferenciaResposta consultar(
            @PathVariable Long id,
            @Parameter(description = "true: referência dos dados simulados; false (padrão): dos reais")
            @RequestParam(defaultValue = "false") boolean simulado) {
        return referencias.consultar(id, simulado);
    }

    @PostMapping("/recalcular")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Recalcula a referência (ADMIN e TECNICO)",
            description = "Gera uma versão nova e imutável a partir das janelas boas dos ensaios \"normal\" "
                    + "(e, com a deriva ligada, das janelas de uso avaliadas NORMAL nos últimos dias). "
                    + "A versão anterior fica guardada.")
    @ApiResponse(responseCode = "201", description = "Versão criada")
    public VersaoReferenciaResposta recalcular(@PathVariable Long id,
                                               @RequestParam(defaultValue = "false") boolean simulado,
                                               @AuthenticationPrincipal Jwt jwt) {
        return referencias.recalcular(id, simulado, jwt == null ? null : Long.valueOf(jwt.getSubject()));
    }

    @GetMapping("/versoes")
    @Operation(summary = "Versões da referência, mais recente primeiro")
    public Pagina<VersaoReferenciaResposta> versoes(@PathVariable Long id,
                                                    @RequestParam(defaultValue = "false") boolean simulado,
                                                    @RequestParam(defaultValue = "0") @Min(0) int page,
                                                    @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return referencias.versoes(id, simulado, page, size);
    }
}
