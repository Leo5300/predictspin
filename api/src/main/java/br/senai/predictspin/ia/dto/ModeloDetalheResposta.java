package br.senai.predictspin.ia.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/** Uma versão com as métricas da validação, a importância e os avisos (referência mudou, dado simulado). */
@Schema(name = "ModeloDetalhe")
public record ModeloDetalheResposta(
        ModeloResumoResposta modelo,
        MetadadosModelo metadados,
        @Schema(description = "Avisos prontos: referência mudou depois do treino, canal desabilitado, dado simulado...")
        List<String> avisos,
        @Schema(description = "Como a API executa o modelo: onnx (ONNX Runtime) ou java (árvores em Java puro)")
        String caminho) {
}
