package br.senai.predictspin.catalogo;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.catalogo.dto.AlteracaoItemCatalogoRequisicao;
import br.senai.predictspin.catalogo.dto.ConflitoCatalogoResposta;
import br.senai.predictspin.catalogo.dto.ItemCatalogoResposta;
import br.senai.predictspin.catalogo.dto.NovoItemCatalogoRequisicao;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Catálogos", description = "Materiais e ferramentas da receita do corte. Listar e criar: ADMIN e "
        + "TECNICO. Renomear e desativar: ADMIN.")
public class CatalogoController {

    private static final String BUSCA = "Parte do nome; ignora maiúsculas, acentos, pontuação e espaços extras";
    private static final String ATIVOS = "true: só ativos; false: só desativados; sem o parâmetro, todos";

    private final CatalogoService catalogo;

    public CatalogoController(CatalogoService catalogo) {
        this.catalogo = catalogo;
    }

    // ---------------------------------------------------------------- materiais

    @GetMapping("/materiais")
    @Operation(summary = "Lista materiais, em ordem de nome, com busca")
    public Pagina<ItemCatalogoResposta> listarMateriais(
            @Parameter(description = BUSCA) @RequestParam(required = false) String busca,
            @Parameter(description = ATIVOS) @RequestParam(required = false) Boolean ativos,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        return catalogo.listar(TipoCatalogo.MATERIAL, busca, ativos, PageRequest.of(page, size));
    }

    @PostMapping("/materiais")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Cria um material")
    @ApiResponse(responseCode = "201", description = "Material criado")
    @ApiResponse(responseCode = "409", description = "Já existe material com o mesmo nome normalizado; o corpo traz o existente",
            content = @Content(schema = @Schema(implementation = ConflitoCatalogoResposta.class)))
    public ItemCatalogoResposta criarMaterial(@Valid @RequestBody NovoItemCatalogoRequisicao requisicao,
                                              @AuthenticationPrincipal Jwt jwt) {
        return catalogo.criar(TipoCatalogo.MATERIAL, requisicao, usuario(jwt));
    }

    @PatchMapping("/materiais/{id}")
    @Operation(summary = "Renomeia o material ou troca a descrição (ADMIN)")
    @ApiResponse(responseCode = "200", description = "Material alterado")
    @ApiResponse(responseCode = "409", description = "O novo nome já existe em outro material",
            content = @Content(schema = @Schema(implementation = ConflitoCatalogoResposta.class)))
    public ItemCatalogoResposta alterarMaterial(@PathVariable Long id,
                                                @Valid @RequestBody AlteracaoItemCatalogoRequisicao requisicao) {
        return catalogo.alterar(TipoCatalogo.MATERIAL, id, requisicao);
    }

    @PostMapping("/materiais/{id}/desativar")
    @Operation(summary = "Desativa o material (ADMIN): some da escolha, os ensaios continuam apontando para ele")
    public ItemCatalogoResposta desativarMaterial(@PathVariable Long id) {
        return catalogo.desativar(TipoCatalogo.MATERIAL, id);
    }

    // ---------------------------------------------------------------- ferramentas

    @GetMapping("/ferramentas")
    @Operation(summary = "Lista ferramentas, em ordem de nome, com busca")
    public Pagina<ItemCatalogoResposta> listarFerramentas(
            @Parameter(description = BUSCA) @RequestParam(required = false) String busca,
            @Parameter(description = ATIVOS) @RequestParam(required = false) Boolean ativos,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        return catalogo.listar(TipoCatalogo.FERRAMENTA, busca, ativos, PageRequest.of(page, size));
    }

    @PostMapping("/ferramentas")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Cria uma ferramenta")
    @ApiResponse(responseCode = "201", description = "Ferramenta criada")
    @ApiResponse(responseCode = "409", description = "Já existe ferramenta com o mesmo nome normalizado; o corpo traz a existente",
            content = @Content(schema = @Schema(implementation = ConflitoCatalogoResposta.class)))
    public ItemCatalogoResposta criarFerramenta(@Valid @RequestBody NovoItemCatalogoRequisicao requisicao,
                                                @AuthenticationPrincipal Jwt jwt) {
        return catalogo.criar(TipoCatalogo.FERRAMENTA, requisicao, usuario(jwt));
    }

    @PatchMapping("/ferramentas/{id}")
    @Operation(summary = "Renomeia a ferramenta ou troca a descrição (ADMIN)")
    @ApiResponse(responseCode = "200", description = "Ferramenta alterada")
    @ApiResponse(responseCode = "409", description = "O novo nome já existe em outra ferramenta",
            content = @Content(schema = @Schema(implementation = ConflitoCatalogoResposta.class)))
    public ItemCatalogoResposta alterarFerramenta(@PathVariable Long id,
                                                  @Valid @RequestBody AlteracaoItemCatalogoRequisicao requisicao) {
        return catalogo.alterar(TipoCatalogo.FERRAMENTA, id, requisicao);
    }

    @PostMapping("/ferramentas/{id}/desativar")
    @Operation(summary = "Desativa a ferramenta (ADMIN): some da escolha, os ensaios continuam apontando para ela")
    public ItemCatalogoResposta desativarFerramenta(@PathVariable Long id) {
        return catalogo.desativar(TipoCatalogo.FERRAMENTA, id);
    }

    private static Long usuario(Jwt jwt) {
        return jwt == null ? null : Long.valueOf(jwt.getSubject());
    }
}
