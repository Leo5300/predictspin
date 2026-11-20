package br.senai.predictspin.ia;

import jakarta.validation.constraints.Min;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.config.OpenApiConfig;
import br.senai.predictspin.ia.dto.LinhaConjuntoResposta;
import br.senai.predictspin.ia.dto.ResumoConjuntoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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

    public TreinoServicoController(ConjuntoTreinoService conjunto) {
        this.conjunto = conjunto;
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
