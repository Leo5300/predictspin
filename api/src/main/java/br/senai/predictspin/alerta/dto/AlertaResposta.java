package br.senai.predictspin.alerta.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alerta.EstadoAlerta;
import io.swagger.v3.oas.annotations.media.Schema;

/** Um alerta de máquina ou de instrumento, com o ciclo de vida da ISA-18.2. */
public record AlertaResposta(
        Long id,
        Long maquinaId,
        @Schema(example = "TORNO-01") String maquina,
        @Schema(example = "B") String ponto,
        @Schema(description = "maquina: desvio da vibração; instrumento: sensor solto, caído ou com defeito",
                allowableValues = {"maquina", "instrumento"}) String tipo,
        @Schema(description = "ATENÇÃO e instrumento = baixa; ALARME = alta", allowableValues = {"baixa", "alta"})
        String prioridade,
        EstadoAlerta estado,
        @Schema(description = "Severidade atual") Nivel nivel,
        @Schema(description = "Pior severidade atingida") Nivel piorNivel,
        @Schema(description = "z da medida dominante na última atualização") @Nullable Double z,
        @Nullable Double piorZ,
        @Schema(description = "Medida dominante (a de maior z)", example = "rms_g") String metrica,
        double valor,
        @Nullable String explicacao,
        @Schema(description = "O que conferir primeiro (orientação de inspeção, não diagnóstico)")
        String acaoRecomendada,
        @Schema(description = "Componente provável do ponto") @Nullable String componente,
        @Schema(description = "Número da versão da referência usada") @Nullable Integer referenciaVersao,
        @Nullable String firmwareVersao,
        @Nullable String calibracao,
        @Nullable Long ensaioId,
        @Schema(description = "Condição do ensaio aberto quando o alerta nasceu") @Nullable String condicaoEnsaio,
        @Schema(description = "true: aberto durante ensaio de condição; não abre OS nem entra nos indicadores")
        boolean duranteEnsaioDeCondicao,
        boolean simulado,
        @Schema(description = "Janela de origem") Long janelaId,
        Instant criadoEm,
        @Nullable Instant atualizadoEm,
        @Nullable Instant reconhecidoEm,
        @Nullable String reconhecidoPor,
        @Nullable Instant normalizadoEm,
        @Nullable Instant encerradoEm,
        @Nullable Instant suprimidoAte,
        @Nullable String motivoSupressao,
        @Nullable String suprimidoPor,
        @Schema(description = "OS aberta a partir deste alerta") @Nullable Long ordemServicoId) {
}
