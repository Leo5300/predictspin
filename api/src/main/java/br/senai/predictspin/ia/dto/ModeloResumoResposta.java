package br.senai.predictspin.ia.dto;

import java.time.Instant;
import java.util.List;

import org.springframework.lang.Nullable;

import io.swagger.v3.oas.annotations.media.Schema;

/** Uma versão de modelo na lista: estado, quando, quem, tipo de dado e o tamanho do conjunto. */
@Schema(name = "ModeloResumo")
public record ModeloResumoResposta(
        long id,
        long maquinaId,
        boolean simulado,
        int versao,
        @Schema(description = "candidato, ativo ou arquivado", allowableValues = {"candidato", "ativo", "arquivado"})
        String estado,
        Instant criadoEm,
        @Nullable String criadoPor,
        @Nullable Instant ativadoEm,
        @Nullable String ativadoPor,
        @Nullable Long trabalhoId,
        String versaoVetor,
        @Schema(description = "Versão da referência usada no treino") @Nullable Integer referenciaNumero,
        double limiarAnomalia,
        @Schema(description = "Classes do classificador; vazio = só anomalia") List<String> classes,
        MetadadosModelo.Conjunto conjunto,
        @Schema(description = "F1 macro da validação por ensaio; nulo sem classificador ou sem validação")
        @Nullable Double f1MacroPorEnsaio,
        int tamanhoBytes,
        @Schema(description = "\"dado simulado: não é resultado\" quando o treino foi com dado simulado")
        @Nullable String avisoSimulado) {
}
