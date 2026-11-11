package br.senai.predictspin.telemetria.dto;

import java.util.List;

import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.Etapa;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Quantos ensaios válidos (encerrados, não descartados, com ao menos uma janela) existem em cada
 * combinação de etapa, condição e rotação alvo, e quantos faltam para a meta.
 */
public record CoberturaResposta(
        Long maquinaId,
        Boolean simulado,
        @Schema(description = "Ensaios válidos desejados por combinação")
        int meta,
        @Schema(description = "Rotações consideradas na grade")
        List<Integer> rotacoesRpm,
        int combinacoes,
        int combinacoesCompletas,
        long ensaiosValidos,
        long ensaiosFaltantes,
        List<Item> itens) {

    public record Item(Etapa etapa, Condicao condicao,
                       @Schema(description = "treino (rótulo da classificação) ou validacao (conferência de alerta, "
                               + "nunca classe de treino)")
                       Condicao.Uso uso,
                       Integer rotacaoAlvoRpm, long ensaiosValidos, long faltam) {
    }
}
