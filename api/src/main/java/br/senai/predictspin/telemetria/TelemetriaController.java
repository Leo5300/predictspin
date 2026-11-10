package br.senai.predictspin.telemetria;

import java.time.Instant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.config.OpenApiConfig;
import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.dto.IngestaoResposta;
import br.senai.predictspin.telemetria.dto.TelemetriaPontoResposta;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;
import br.senai.predictspin.telemetria.dto.UltimaJanelaResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Telemetria", description = "Ingestão pelo dispositivo e consultas pelos usuários")
public class TelemetriaController {

    private final IngestaoService ingestao;
    private final ConsultaTelemetriaService consulta;

    public TelemetriaController(IngestaoService ingestao, ConsultaTelemetriaService consulta) {
        this.ingestao = ingestao;
        this.consulta = consulta;
    }

    @PostMapping("/telemetria")
    @Operation(summary = "Recebe uma janela de telemetria do dispositivo",
            description = "Autenticação por X-Dispositivo-Id e X-Dispositivo-Chave. Idempotente por "
                    + "(dispositivo, medido_em): o reenvio responde 200 e não grava nada. Contrato em docs/payload.md.",
            security = {@SecurityRequirement(name = OpenApiConfig.ESQUEMA_DISPOSITIVO_ID,
                    scopes = {}), @SecurityRequirement(name = OpenApiConfig.ESQUEMA_DISPOSITIVO_CHAVE)})
    @ApiResponse(responseCode = "201", description = "Janela gravada")
    @ApiResponse(responseCode = "200", description = "Janela já recebida antes (reenvio)")
    @ApiResponse(responseCode = "400", description = "Payload inválido, ponto ou canal desconhecido, medido_em no futuro")
    @ApiResponse(responseCode = "401", description = "Credencial de dispositivo ausente ou inválida")
    @ApiResponse(responseCode = "403", description = "Campo 'dispositivo' diferente do cabeçalho")
    public ResponseEntity<IngestaoResposta> receber(@AuthenticationPrincipal DispositivoAutenticado dispositivo,
                                                    @Valid @RequestBody TelemetriaRequisicao requisicao) {
        IngestaoService.Resultado resultado = ingestao.receber(dispositivo, requisicao);
        return ResponseEntity.status(resultado.criada() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(resultado.resposta());
    }

    @GetMapping("/pontos/{id}/telemetria")
    @Operation(summary = "Série temporal de um ponto de medição, mais recente primeiro, paginada",
            description = "Sem 'de', usa as últimas 24 h até 'ate' (ou agora).")
    public Pagina<TelemetriaPontoResposta> seriePorPonto(
            @PathVariable Long id,
            @Parameter(description = "Início, inclusivo (ISO-8601, ex.: 2026-11-10T00:00:00Z)")
            @RequestParam(required = false) Instant de,
            @Parameter(description = "Fim, exclusivo (ISO-8601)")
            @RequestParam(required = false) Instant ate,
            @Parameter(description = "Só dados de dispositivo simulado (true) ou real (false)")
            @RequestParam(required = false) Boolean simulado,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        return consulta.seriePorPonto(id, de, ate, simulado, PageRequest.of(page, size));
    }

    @GetMapping("/maquinas/{id}/ultima-janela")
    @Operation(summary = "Última janela da máquina: os pontos, os canais, a rotação e há quanto tempo chegou")
    @ApiResponse(responseCode = "404", description = "Máquina inexistente ou sem janela recebida")
    public UltimaJanelaResposta ultimaJanela(
            @PathVariable Long id,
            @Parameter(description = "Só dados de dispositivo simulado (true) ou real (false)")
            @RequestParam(required = false) Boolean simulado) {
        return consulta.ultimaJanela(id, simulado);
    }
}
