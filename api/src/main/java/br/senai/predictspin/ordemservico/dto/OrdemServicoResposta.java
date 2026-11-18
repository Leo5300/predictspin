package br.senai.predictspin.ordemservico.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import br.senai.predictspin.alerta.RetornoTecnico;
import br.senai.predictspin.ordemservico.StatusOrdemServico;
import io.swagger.v3.oas.annotations.media.Schema;

/** Ordem de serviço aberta pela regra, com o retorno do técnico ao concluir. */
public record OrdemServicoResposta(
        Long id,
        @Schema(example = "OS-2026-0001") String numero,
        Long maquinaId,
        @Schema(example = "TORNO-01") String maquina,
        @Schema(example = "B") String ponto,
        @Schema(description = "Componente provável do ponto") @Nullable String componente,
        @Schema(description = "aberta → em_andamento → concluida") StatusOrdemServico status,
        @Schema(description = "alarme_continuo: ALARME por tempo seguido; severidade: severidade acumulada",
                allowableValues = {"alarme_continuo", "severidade"}) String motivoAbertura,
        @Schema(description = "Alerta de origem") @Nullable Long alertaId,
        @Nullable String explicacao,
        @Schema(description = "O que conferir primeiro (orientação de inspeção, não diagnóstico)")
        String acaoRecomendada,
        @Schema(description = "Severidade acumulada do ponto no momento da abertura, em z·s") double severidadeAcumulada,
        @Nullable Integer referenciaVersao,
        @Nullable String firmwareVersao,
        @Nullable String calibracao,
        boolean simulado,
        @Schema(description = "Nome de quem assumiu") @Nullable String responsavel,
        Instant abertaEm,
        @Nullable Instant assumidaEm,
        @Nullable Instant concluidaEm,
        @Schema(description = "confirmada: havia problema; rejeitada: falso positivo. Vira rótulo do treino (parte B)")
        @Nullable RetornoTecnico retornoTecnico,
        @Nullable String comentarioTecnico) {
}
