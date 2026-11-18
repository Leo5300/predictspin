package br.senai.predictspin.alerta;

import java.time.Instant;

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

import br.senai.predictspin.alerta.dto.AlertaDetalheResposta;
import br.senai.predictspin.alerta.dto.AlertaResposta;
import br.senai.predictspin.alerta.dto.DiagnosticoAlarmeResposta;
import br.senai.predictspin.alerta.dto.LimitesResposta;
import br.senai.predictspin.alerta.dto.SupressaoRequisicao;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Validated
@RequestMapping("/api/v1")
@Tag(name = "Alertas", description = "Alertas no padrão ISA-18.2 e diagnóstico da regra de alarme")
public class AlertaController {

    private final AlertaService alertas;
    private final DiagnosticoAlarmeService diagnostico;

    public AlertaController(AlertaService alertas, DiagnosticoAlarmeService diagnostico) {
        this.alertas = alertas;
        this.diagnostico = diagnostico;
    }

    @GetMapping("/alertas")
    @Operation(summary = "Lista alertas, não reconhecidos primeiro, paginado e com filtros")
    public Pagina<AlertaResposta> listar(
            @RequestParam(name = "maquina_id", required = false) Long maquinaId,
            @RequestParam(required = false) EstadoAlerta estado,
            @Parameter(description = "Código do ponto (A, B, C)") @RequestParam(required = false) String ponto,
            @Parameter(description = "baixa ou alta") @RequestParam(required = false) String prioridade,
            @Parameter(description = "maquina ou instrumento") @RequestParam(required = false) String tipo,
            @RequestParam(required = false) Boolean simulado,
            @Parameter(description = "Abertos a partir deste instante (ISO-8601)")
            @RequestParam(required = false) Instant de,
            @Parameter(description = "Abertos antes deste instante (ISO-8601)")
            @RequestParam(required = false) Instant ate,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        if (prioridade != null && !prioridade.equals("baixa") && !prioridade.equals("alta")) {
            throw new RequisicaoInvalidaException("prioridade deve ser baixa ou alta");
        }
        if (tipo != null && !tipo.equals(AlertaService.MAQUINA) && !tipo.equals(AlertaService.INSTRUMENTO)) {
            throw new RequisicaoInvalidaException("tipo deve ser maquina ou instrumento");
        }
        return alertas.listar(new AlertaSql.Filtro(maquinaId, estado, ponto, prioridade, tipo, simulado, de, ate),
                page, size);
    }

    @GetMapping("/alertas/{id}")
    @Operation(summary = "Detalha um alerta, com o histórico de cada mudança de estado")
    public AlertaDetalheResposta detalhe(@PathVariable Long id) {
        return alertas.detalhe(id);
    }

    @PostMapping("/alertas/{id}/reconhecer")
    @Operation(summary = "Reconhece um alerta (\"eu vi\"); qualquer usuário",
            description = "Não apaga nem conserta: ativo vira reconhecido; normalizado não reconhecido vira encerrado.")
    @ApiResponse(responseCode = "200", description = "Alerta reconhecido")
    @ApiResponse(responseCode = "409", description = "Alerta já reconhecido")
    public AlertaResposta reconhecer(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return alertas.reconhecer(id, Long.parseLong(jwt.getSubject()));
    }

    @PostMapping("/alertas/{id}/suprimir")
    @Operation(summary = "Suprime um alerta ativo, com motivo e prazo (só ADMIN)")
    @ApiResponse(responseCode = "200", description = "Alerta suprimido")
    @ApiResponse(responseCode = "409", description = "Alerta não está ativo")
    public AlertaResposta suprimir(@PathVariable Long id, @Valid @RequestBody SupressaoRequisicao requisicao,
                                   @AuthenticationPrincipal Jwt jwt) {
        return alertas.suprimir(id, Long.parseLong(jwt.getSubject()), requisicao.motivo(), requisicao.minutos());
    }

    @PostMapping("/alertas/{id}/cancelar-supressao")
    @Operation(summary = "Cancela a supressão antes do prazo (só ADMIN)")
    @ApiResponse(responseCode = "200", description = "Supressão cancelada")
    @ApiResponse(responseCode = "409", description = "Alerta não está suprimido")
    public AlertaResposta cancelarSupressao(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return alertas.cancelarSupressao(id, Long.parseLong(jwt.getSubject()));
    }

    @GetMapping("/alarmes/limites")
    @Operation(summary = "Limites em uso da referência, do alarme e da OS (todos PROPOSTA a confirmar)")
    public LimitesResposta limites() {
        return diagnostico.limites();
    }

    @GetMapping("/maquinas/{id}/alarmes/diagnostico")
    @Operation(summary = "Diagnóstico da regra de alarme: indicadores, severidade, deriva, piso e calibração")
    public DiagnosticoAlarmeResposta diagnostico(@PathVariable Long id,
                                                 @RequestParam(defaultValue = "false") boolean simulado) {
        return diagnostico.diagnostico(id, simulado);
    }
}
