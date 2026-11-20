package br.senai.predictspin.ia.dto;

import java.util.List;

import org.springframework.lang.Nullable;

import br.senai.predictspin.ia.PropriedadesModelo;
import br.senai.predictspin.ia.PropriedadesTreino;
import io.swagger.v3.oas.annotations.media.Schema;

/** Cabeçalho do conjunto de treino: colunas, versões e os parâmetros do treino (da application.yml). */
@Schema(name = "ResumoConjunto")
public record ResumoConjuntoResposta(
        long maquinaId,
        boolean simulado,
        String versaoVetor,
        @Schema(description = "Número da versão da referência em uso; nulo sem referência")
        @Nullable Integer referenciaNumero,
        @Nullable Long referenciaVersaoId,
        List<String> caracteristicas,
        @Schema(description = "Canais da fusão habilitados (fazem parte do vetor)") List<String> canais,
        List<String> classes,
        long totalCandidatas,
        @Schema(description = "z de atenção da regra (ps.alarme.z-atencao), para comparar regra × modelo")
        double zAtencao,
        PropriedadesModelo modelo,
        PropriedadesTreino.Publicas treino) {
}
