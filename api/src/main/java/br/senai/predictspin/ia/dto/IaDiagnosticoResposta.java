package br.senai.predictspin.ia.dto;

import java.util.List;
import java.util.Map;

import org.springframework.lang.Nullable;

import br.senai.predictspin.ia.PropriedadesFusao;
import br.senai.predictspin.ia.PropriedadesModelo;
import br.senai.predictspin.ia.PropriedadesTendencia;
import br.senai.predictspin.ia.PropriedadesTreino;
import io.swagger.v3.oas.annotations.media.Schema;

/** O que o Diagnóstico mostra da IA: modelo ativo, se ele roda, erros, canais da fusão, tendência e limites. */
@Schema(name = "IaDiagnostico")
public record IaDiagnosticoResposta(
        boolean simulado,
        @Schema(description = "Modelo ativo deste tipo de dado; nulo sem modelo ativo") @Nullable ModeloResumoResposta ativo,
        @Schema(description = "onnx ou java") String caminho,
        @Schema(description = "O modelo ativo está rodando nas janelas") boolean roda,
        @Schema(description = "Por que o modelo ativo não roda (versão do vetor, canal exigido desabilitado...)")
        @Nullable String motivoNaoRoda,
        @Schema(description = "Avisos prontos (referência mudou: treine de novo...)") List<String> avisos,
        @Schema(description = "Janelas com segunda opinião desde que a API subiu") long inferencias,
        @Schema(description = "Erros na segunda opinião desde que a API subiu (a regra não é afetada)") long erros,
        @Nullable String ultimoErro,
        @Schema(description = "Segunda opinião nas janelas da última hora (modelo ativo)") UltimaHora ultimaHora,
        List<CanalFusao> canais,
        @Schema(description = "Tendência habilitada (ps.tendencia.habilitada)") boolean tendenciaHabilitada,
        PropriedadesModelo modelo,
        PropriedadesTreino.Publicas treino,
        PropriedadesFusao fusao,
        PropriedadesTendencia tendencia) {

    @Schema(name = "IaUltimaHora")
    public record UltimaHora(long janelas, long anomalias, @Schema(description = "Janelas por classe mais provável")
                             Map<String, Long> porClasse) {
    }

    @Schema(name = "IaCanalFusao")
    public record CanalFusao(String codigo, boolean habilitado) {
    }
}
