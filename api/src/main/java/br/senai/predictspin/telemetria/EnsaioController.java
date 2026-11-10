package br.senai.predictspin.telemetria;

import java.io.IOException;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.telemetria.dto.CoberturaResposta;
import br.senai.predictspin.telemetria.dto.EnsaioResposta;
import br.senai.predictspin.telemetria.dto.NovoEnsaioRequisicao;
import br.senai.predictspin.telemetria.dto.ResumoEnsaioResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Ensaios", description = "Coleta rotulada para treinar a classificação. Somente ADMIN e TECNICO.")
public class EnsaioController {

    private static final DateTimeFormatter CARIMBO = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final EnsaioService ensaios;
    private final ExportacaoService exportacao;

    public EnsaioController(EnsaioService ensaios, ExportacaoService exportacao) {
        this.ensaios = ensaios;
        this.exportacao = exportacao;
    }

    @PostMapping("/maquinas/{id}/ensaios")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Abre um ensaio na máquina",
            description = "O código é gerado pela API. As janelas recebidas enquanto o ensaio está aberto são "
                    + "gravadas com ele. Só um ensaio aberto por máquina.")
    @ApiResponse(responseCode = "201", description = "Ensaio aberto")
    @ApiResponse(responseCode = "409", description = "Já existe ensaio aberto na máquina")
    public EnsaioResposta abrir(@PathVariable Long id, @Valid @RequestBody NovoEnsaioRequisicao requisicao) {
        return ensaios.abrir(id, requisicao);
    }

    @GetMapping("/maquinas/{id}/ensaios")
    @Operation(summary = "Lista ensaios da máquina, mais recente primeiro, paginado e com filtros")
    public Pagina<EnsaioResposta> listar(
            @PathVariable Long id,
            @RequestParam(required = false) Etapa etapa,
            @Parameter(description = "normal, ferramenta_desgastada, avanco_excessivo ou rotacao_inadequada")
            @RequestParam(required = false) Condicao condicao,
            @RequestParam(required = false) Boolean simulado,
            @RequestParam(required = false) Boolean descartado,
            @Parameter(description = "true: só abertos; false: só encerrados")
            @RequestParam(required = false) Boolean aberto,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int size) {
        return ensaios.listar(id, new EnsaioService.Filtro(etapa, condicao, simulado, descartado, aberto),
                PageRequest.of(page, size));
    }

    @GetMapping("/ensaios/{id}")
    @Operation(summary = "Detalha um ensaio")
    public EnsaioResposta buscar(@PathVariable Long id) {
        return ensaios.buscar(id);
    }

    @PostMapping("/ensaios/{id}/encerrar")
    @Operation(summary = "Encerra o ensaio aberto")
    @ApiResponse(responseCode = "409", description = "Ensaio já encerrado")
    public EnsaioResposta encerrar(@PathVariable Long id) {
        return ensaios.encerrar(id);
    }

    @PostMapping("/ensaios/{id}/descartar")
    @Operation(summary = "Descarta o ensaio (marca, não apaga); se estiver aberto, também o encerra",
            description = "Ensaio descartado sai da cobertura e da exportação.")
    @ApiResponse(responseCode = "409", description = "Ensaio já descartado")
    public EnsaioResposta descartar(@PathVariable Long id) {
        return ensaios.descartar(id);
    }

    @GetMapping("/ensaios/{id}/resumo")
    @Operation(summary = "Duração, número de janelas, janelas saturadas e rotação média do ensaio")
    public ResumoEnsaioResposta resumo(@PathVariable Long id) {
        return ensaios.resumo(id);
    }

    @GetMapping("/maquinas/{id}/coleta/cobertura")
    @Operation(summary = "Ensaios válidos por etapa, condição e rotação, e quantos faltam para a meta",
            description = "Válido = encerrado, não descartado e com ao menos uma janela. Sem 'rotacoes', a grade "
                    + "usa as rotações alvo já usadas em ensaios da máquina.")
    public CoberturaResposta cobertura(
            @PathVariable Long id,
            @RequestParam(required = false) Boolean simulado,
            @Parameter(description = "Ensaios válidos desejados por combinação")
            @RequestParam(defaultValue = "3") @Min(1) @Max(100) int meta,
            @Parameter(description = "Rotações alvo da grade, separadas por vírgula (ex.: 500,1000,1500)")
            @RequestParam(required = false) List<@Min(0) @Max(30000) Integer> rotacoes) {
        return ensaios.cobertura(id, simulado, meta, rotacoes);
    }

    @GetMapping(value = "/ensaios/exportar.csv", produces = "text/csv")
    @Operation(summary = "Exporta o conjunto de treino em CSV, em fluxo",
            description = "Uma linha por janela e ponto, só de ensaios encerrados e não descartados, com os rótulos "
                    + "do ensaio e uma coluna por canal. Use simulado=false para só dado real.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "text/csv"))
    public void exportar(
            @RequestParam(required = false) Boolean simulado,
            @Parameter(description = "Restringe a uma máquina")
            @RequestParam(name = "maquina_id", required = false) Long maquinaId,
            HttpServletResponse resposta) throws IOException {
        String nome = "ensaios-" + CARIMBO.format(ZonedDateTime.now(ZoneOffset.UTC))
                + (simulado == null ? "" : simulado ? "-simulados" : "-reais") + ".csv";
        resposta.setContentType("text/csv; charset=UTF-8");
        resposta.setCharacterEncoding("UTF-8");
        resposta.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nome + "\"");
        exportacao.exportar(simulado, maquinaId, resposta.getWriter());
    }
}
