package br.senai.predictspin.ia.dto;

import java.util.List;
import java.util.Map;

import org.springframework.lang.Nullable;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * O que o treino (Python) devolve junto com os arquivos do modelo (metadados.json) e a tela de detalhe mostra.
 * As métricas de modelo treinado com dado simulado provam o encadeamento: "dado simulado: não é resultado".
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(name = "MetadadosModelo")
public record MetadadosModelo(
        String versaoVetor,
        @Nullable Integer referenciaNumero,
        @Nullable Long referenciaVersaoId,
        @Schema(description = "Características usadas, na ordem das colunas do modelo") List<String> caracteristicas,
        @Schema(description = "Características do vetor que ficaram fora (faltavam em alguma janela)")
        List<String> caracteristicasRemovidas,
        @Schema(description = "Canais da fusão que o modelo exige") List<String> canais,
        @Schema(description = "Classes do classificador, na ordem das probabilidades; vazio = só anomalia")
        List<String> classes,
        List<ClasseFora> classesFora,
        double limiarAnomalia,
        @Schema(description = "Para o escore de anomalia a partir da saída do ONNX: -(scores + offset)")
        double offsetAnomalia,
        Metricas metricas,
        Conjunto conjunto,
        @Schema(description = "Importância por permutação, as 10 maiores") List<Importancia> importancia,
        @Schema(description = "Importância de cada característica (usada na explicação)") Map<String, Double> pesos,
        List<String> avisos,
        boolean simulado,
        @Nullable String avisoSimulado,
        @Nullable String geradoEm,
        @Nullable Map<String, String> bibliotecas) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "ClasseForaDoModelo")
    public record ClasseFora(String classe, int ensaios) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "ImportanciaCaracteristica")
    public record Importancia(String nome, double valor) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "MetricasModelo")
    public record Metricas(Validacao porEnsaio, Validacao porDia, double limiarAnomalia, double ifPercentil) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "ValidacaoModelo", description = "Validação por ensaio (GroupKFold) ou por dia (um dia de fora)")
    public record Validacao(
            boolean aplicavel,
            @Nullable String motivo,
            @Schema(description = "Partes da validação por ensaio") @Nullable Integer k,
            @Schema(description = "Dias da validação por dia") @Nullable Integer dias,
            @Nullable Integer janelasTestadas,
            @Nullable Comparacao comparacao,
            @Nullable Classificador classificador) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "ComparacaoRegraModelo",
            description = "Nas mesmas janelas de validação: regra (nível bruto, z ≥ z de atenção, sem atraso) × "
                    + "Isolation Forest")
    public record Comparacao(Taxas regra, Taxas isolationForest) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "TaxasDeteccao")
    public record Taxas(@Schema(description = "Fração das janelas normais em que acusou desvio") @Nullable
                        Double falsoPositivo,
                        @Schema(description = "Fração das janelas não normais em que acusou desvio") @Nullable
                        Double deteccao,
                        int janelasNormais,
                        int janelasNaoNormais) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "MetricasClassificador")
    public record Classificador(List<String> classes,
                                @Schema(description = "Linha = classe real, coluna = classe prevista")
                                List<List<Integer>> matrizConfusao,
                                Map<String, Double> recall,
                                double f1Macro,
                                int janelas) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @Schema(name = "ConjuntoDoModelo")
    public record Conjunto(int janelas, Map<String, Integer> porClasse, Map<String, Integer> porOrigem,
                           Map<String, Integer> ensaiosPorClasse, List<String> dias, Map<String, Integer> excluidas) {
    }
}
