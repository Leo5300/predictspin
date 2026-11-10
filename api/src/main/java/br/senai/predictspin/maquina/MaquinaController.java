package br.senai.predictspin.maquina;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.maquina.dto.DispositivoResposta;
import br.senai.predictspin.maquina.dto.MaquinaResposta;
import br.senai.predictspin.maquina.dto.PontoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/maquinas")
@Tag(name = "Máquinas", description = "Máquinas, pontos de medição e dispositivos. Qualquer usuário autenticado.")
public class MaquinaController {

    private final MaquinaService servico;

    public MaquinaController(MaquinaService servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Lista máquinas com o local, paginado")
    public Pagina<MaquinaResposta> listar(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return servico.listar(PageRequest.of(page, size));
    }

    @GetMapping("/{id}/pontos")
    @Operation(summary = "Lista os pontos de medição da máquina, paginado")
    public Pagina<PontoResposta> pontos(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return servico.listarPontos(id, PageRequest.of(page, size));
    }

    @GetMapping("/{id}/dispositivos")
    @Operation(summary = "Lista os dispositivos da máquina com o último contato, paginado")
    public Pagina<DispositivoResposta> dispositivos(
            @PathVariable Long id,
            @Parameter(description = "Filtra dispositivos simulados (true) ou reais (false)")
            @RequestParam(required = false) Boolean simulado,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return servico.listarDispositivos(id, simulado, PageRequest.of(page, size));
    }
}
