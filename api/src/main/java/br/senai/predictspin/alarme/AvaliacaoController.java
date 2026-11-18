package br.senai.predictspin.alarme;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.alarme.dto.AvaliacaoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/maquinas/{id}/avaliacao")
@Tag(name = "Avaliação", description = "Comparação de cada janela com a referência: z, estado e explicação")
public class AvaliacaoController {

    private final AvaliacaoService avaliacoes;

    public AvaliacaoController(AvaliacaoService avaliacoes) {
        this.avaliacoes = avaliacoes;
    }

    @GetMapping
    @Operation(summary = "Avaliação da janela mais recente da máquina",
            description = "Estado da máquina (pior entre os pontos) e de cada ponto, com o z, o típico e a "
                    + "diferença em % de cada medida. Ponto sem referência vem com situacao sem_referencia.")
    public AvaliacaoResposta atual(@PathVariable Long id,
                                   @Parameter(description = "true: dados simulados; false (padrão): reais")
                                   @RequestParam(defaultValue = "false") boolean simulado) {
        return avaliacoes.atual(id, simulado);
    }
}
