package br.senai.predictspin.ia;

import java.io.IOException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.config.OpenApiConfig;
import br.senai.predictspin.ia.dto.LinhaConjuntoResposta;
import br.senai.predictspin.ia.dto.ModeloResumoResposta;
import br.senai.predictspin.ia.dto.ResumoConjuntoResposta;
import br.senai.predictspin.ia.dto.TrabalhoTreinoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Rotas do serviço de treino (e do comando no notebook), autenticadas pela chave TREINO_CHAVE no cabeçalho
 * X-Treino-Chave, sem usuário.
 */
@RestController
@Validated
@RequestMapping("/api/v1/treino/servico")
@Tag(name = "Serviço de treino", description = "Conjunto rotulado e resultado do treino (só com X-Treino-Chave)")
@SecurityRequirement(name = OpenApiConfig.ESQUEMA_TREINO)
public class TreinoServicoController {

    private final ConjuntoTreinoService conjunto;
    private final TreinoService treino;

    public TreinoServicoController(ConjuntoTreinoService conjunto, TreinoService treino) {
        this.conjunto = conjunto;
        this.treino = treino;
    }

    /** Falha relatada pelo serviço de treino. */
    public record FalhaTreinoRequisicao(@jakarta.validation.constraints.Size(max = 2000) String mensagem) {
    }

    @GetMapping("/trabalhos/{id}")
    @Operation(summary = "Trabalho de treino (máquina e tipo de dado a treinar)")
    public TrabalhoTreinoResposta trabalho(@PathVariable Long id) {
        return treino.trabalho(id);
    }

    @PostMapping("/trabalhos/{id}/inicio")
    @Operation(summary = "O serviço começou a treinar: o trabalho passa a executando")
    @ApiResponse(responseCode = "200", description = "Trabalho executando")
    @ApiResponse(responseCode = "409", description = "Trabalho já concluído ou falhou")
    public TrabalhoTreinoResposta inicio(@PathVariable Long id) {
        return treino.iniciar(id);
    }

    @PostMapping("/trabalhos/{id}/falha")
    @Operation(summary = "O treino falhou: o trabalho passa a falhou, com a mensagem")
    public TrabalhoTreinoResposta falha(@PathVariable Long id, @Valid @RequestBody FalhaTreinoRequisicao corpo) {
        return treino.registrarFalha(id, corpo.mensagem());
    }

    @PostMapping(value = "/trabalhos/{id}/resultado", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Resultado do treino: arquivos do modelo (multipart)",
            description = "anomalia (ONNX do Isolation Forest, obrigatório), classe (ONNX do Random Forest, quando "
                    + "houve classes suficientes), arvores (JSON, plano B) e metadados (JSON, obrigatório). A versão "
                    + "nasce candidata; resultado inválido é recusado (400) e o trabalho falha.")
    @ApiResponse(responseCode = "201", description = "Versão candidata criada")
    public ModeloResumoResposta resultado(@PathVariable Long id,
                                          @RequestPart("anomalia") MultipartFile anomalia,
                                          @RequestPart(value = "classe", required = false) MultipartFile classe,
                                          @RequestPart(value = "arvores", required = false) MultipartFile arvores,
                                          @RequestPart("metadados") MultipartFile metadados) throws IOException {
        return treino.receberResultado(id, new TreinoService.ArquivosRecebidos(bytes(anomalia), bytes(classe),
                bytes(arvores), bytes(metadados)));
    }

    private static byte[] bytes(MultipartFile arquivo) throws IOException {
        return arquivo == null || arquivo.isEmpty() ? null : arquivo.getBytes();
    }

    @GetMapping("/conjunto/resumo")
    @Operation(summary = "Colunas, versões e parâmetros do treino",
            description = "Nomes e ordem das características (versão do vetor), referência em uso, classes, total de "
                    + "janelas rotuladas e os parâmetros do treino da application.yml (ps.modelo, ps.treino).")
    public ResumoConjuntoResposta resumo(@RequestParam("maquina_id") long maquinaId,
                                         @RequestParam(defaultValue = "false") boolean simulado) {
        return conjunto.resumo(maquinaId, simulado);
    }

    @GetMapping("/conjunto")
    @Operation(summary = "Janelas rotuladas com o vetor de características, por página",
            description = "Só janelas com rótulo: ensaios encerrados (T1 e T3, as 5 classes) e, com "
                    + "ps.treino.usar-retorno-os, as janelas do período do alerta de OS concluídas como confirmada "
                    + "(com a condição encontrada) ou rejeitada (como normal). Janela sem vetor vem com o motivo.")
    public Pagina<LinhaConjuntoResposta> pagina(
            @RequestParam("maquina_id") long maquinaId,
            @RequestParam(defaultValue = "false") boolean simulado,
            @RequestParam(defaultValue = "0") @Min(0) int pagina,
            @Parameter(description = "Linhas por página (até limites.treino.pagina_max)")
            @RequestParam(defaultValue = "500") @Min(1) int tamanho) {
        return conjunto.pagina(maquinaId, simulado, pagina, tamanho);
    }
}
