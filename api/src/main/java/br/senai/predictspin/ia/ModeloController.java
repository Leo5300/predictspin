package br.senai.predictspin.ia;

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
import br.senai.predictspin.ia.dto.IaDiagnosticoResposta;
import br.senai.predictspin.ia.dto.ModeloDetalheResposta;
import br.senai.predictspin.ia.dto.ModeloResumoResposta;
import br.senai.predictspin.ia.dto.TendenciaResposta;
import br.senai.predictspin.ia.dto.TrabalhoTreinoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Validated
@RequestMapping("/api/v1")
@Tag(name = "Modelos", description = "Segunda opinião: treinar, versões, métricas e ativação (o alarme continua "
        + "sendo a regra)")
public class ModeloController {

    private final TreinoService treino;
    private final TendenciaService tendencia;

    public ModeloController(TreinoService treino, TendenciaService tendencia) {
        this.treino = treino;
        this.tendencia = tendencia;
    }

    @GetMapping("/maquinas/{id}/tendencia")
    @Operation(summary = "Tendência por ponto (desabilitada por padrão)",
            description = "Séries diárias de severidade acumulada, deriva e, com o canal habilitado, temperatura do "
                    + "cabeçote; inclinação de Theil-Sen com intervalo de 95% e, quando sobe, em quantos dias cruzaria "
                    + "o limite (faixa, nunca data de quebra). Desabilitada: habilitada = false e a mensagem.")
    public TendenciaResposta tendencia(@PathVariable Long id, @RequestParam(defaultValue = "false") boolean simulado) {
        return tendencia.tendencia(id, simulado);
    }

    @PostMapping("/maquinas/{id}/modelos/treinar")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Botão Treinar (ADMIN e TECNICO)",
            description = "Cria um trabalho de treino. Com o serviço de treino configurado, a API o acorda e pede o "
                    + "treino; sem ele, o trabalho traz o comando para rodar no notebook. Acompanhe pelo evento "
                    + "\"treino\" ou por GET /treino/trabalhos/{id}.")
    @ApiResponse(responseCode = "202", description = "Trabalho criado")
    @ApiResponse(responseCode = "409", description = "Já há um treino em andamento nesta máquina e tipo de dado")
    public TrabalhoTreinoResposta treinar(@PathVariable Long id,
                                          @Parameter(description = "true: treina com o dado simulado")
                                          @RequestParam(defaultValue = "false") boolean simulado,
                                          @AuthenticationPrincipal Jwt jwt) {
        return treino.treinar(id, simulado, jwt == null ? null : Long.valueOf(jwt.getSubject()));
    }

    @GetMapping("/maquinas/{id}/treino/trabalhos")
    @Operation(summary = "Trabalhos de treino da máquina, mais recente primeiro")
    public Pagina<TrabalhoTreinoResposta> trabalhos(@PathVariable Long id,
                                                    @RequestParam(defaultValue = "false") boolean simulado,
                                                    @RequestParam(defaultValue = "0") @Min(0) int page,
                                                    @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return treino.trabalhos(id, simulado, page, size);
    }

    @GetMapping("/treino/trabalhos/{id}")
    @Operation(summary = "Estado de um trabalho de treino")
    public TrabalhoTreinoResposta trabalho(@PathVariable Long id) {
        return treino.trabalho(id);
    }

    @GetMapping("/maquinas/{id}/modelos")
    @Operation(summary = "Versões de modelo da máquina, mais recente primeiro")
    public Pagina<ModeloResumoResposta> modelos(@PathVariable Long id,
                                                @RequestParam(defaultValue = "false") boolean simulado,
                                                @RequestParam(defaultValue = "0") @Min(0) int page,
                                                @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return treino.listar(id, simulado, page, size);
    }

    @GetMapping("/modelos/{id}")
    @Operation(summary = "Uma versão com as métricas da validação, a comparação com a regra e a importância")
    public ModeloDetalheResposta modelo(@PathVariable Long id) {
        return treino.detalhe(id);
    }

    @PostMapping("/modelos/{id}/ativar")
    @Operation(summary = "Ativa a versão (só ADMIN)",
            description = "Uma versão ativa por máquina e tipo de dado; a anterior vira arquivada. O modelo nunca "
                    + "muda estado, prioridade nem abertura de alerta: só acrescenta a segunda opinião.")
    @ApiResponse(responseCode = "200", description = "Versão ativada")
    @ApiResponse(responseCode = "409", description = "A versão já está ativa")
    public ModeloDetalheResposta ativar(@PathVariable Long id, @AuthenticationPrincipal Jwt jwt) {
        return treino.ativar(id, jwt == null ? null : Long.valueOf(jwt.getSubject()));
    }

    @GetMapping("/maquinas/{id}/ia/diagnostico")
    @Operation(summary = "Diagnóstico da IA: modelo ativo, se roda e por quê, erros, canais da fusão, tendência")
    public IaDiagnosticoResposta diagnostico(@PathVariable Long id,
                                             @RequestParam(defaultValue = "false") boolean simulado) {
        return treino.diagnostico(id, simulado);
    }
}
