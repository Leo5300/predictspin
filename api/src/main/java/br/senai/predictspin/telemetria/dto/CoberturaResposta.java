package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonValue;

import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.Etapa;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Quantos ensaios válidos (encerrados, não descartados, com ao menos uma janela) existem em cada
 * combinação de etapa, condição e rotação alvo, e quantos faltam para a meta.
 */
public record CoberturaResposta(
        Long maquinaId,
        @Nullable Boolean simulado,
        @Schema(description = "Ensaios válidos desejados por combinação")
        int meta,
        @Schema(description = "Rotações consideradas na grade")
        List<Integer> rotacoesRpm,
        @Schema(description = "De onde vieram as rotações: parametro (informadas na consulta), plano (plano de "
                + "coleta da máquina) ou usadas (rotações alvo dos ensaios já feitos)")
        OrigemRotacoes origemRotacoes,
        int combinacoes,
        int combinacoesCompletas,
        long ensaiosValidos,
        long ensaiosFaltantes,
        List<Item> itens) {

    public enum OrigemRotacoes {
        PARAMETRO("parametro"),
        PLANO("plano"),
        USADAS("usadas");

        private final String valor;

        OrigemRotacoes(String valor) {
            this.valor = valor;
        }

        @JsonValue
        public String valor() {
            return valor;
        }
    }

    @Schema(name = "CoberturaItem")
    public record Item(Etapa etapa, Condicao condicao,
                       @Schema(description = "treino (rótulo da classificação) ou validacao (conferência de alerta, "
                               + "nunca classe de treino)")
                       Condicao.Uso uso,
                       Integer rotacaoAlvoRpm, long ensaiosValidos, long faltam) {
    }
}
