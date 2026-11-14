package br.senai.predictspin.telemetria.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import br.senai.predictspin.telemetria.EnsaioAlteracaoRepository;
import io.swagger.v3.oas.annotations.media.Schema;

/** Uma correção da receita: os valores em texto, como estavam e como ficaram (null = em branco). */
public record AlteracaoEnsaioResposta(
        Long id,
        @Schema(example = "material", description = "material, ferramenta, avanco_alvo, profundidade_corte_mm, "
                + "diametro_peca_mm, fluido_corte ou observacao") String campo,
        @Nullable String valorAntigo,
        @Nullable String valorNovo,
        @Nullable Long alteradoPor,
        @Nullable String alteradoPorNome,
        Instant alteradoEm) {

    public static AlteracaoEnsaioResposta de(EnsaioAlteracaoRepository.Linha l) {
        return new AlteracaoEnsaioResposta(l.getId(), l.getCampo(), l.getValorAntigo(), l.getValorNovo(),
                l.getAlteradoPor(), l.getAlteradoPorNome(), l.getAlteradoEm());
    }
}
