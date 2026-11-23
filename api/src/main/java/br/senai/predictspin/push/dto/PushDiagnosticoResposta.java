package br.senai.predictspin.push.dto;

import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

/** Contadores do push desde que a API iniciou (só ADMIN). */
public record PushDiagnosticoResposta(
        @Schema(description = "ps.push.habilitado") boolean habilitado,
        @Schema(description = "Início da contagem (subida da API)") Instant desde,
        @Schema(description = "Mensagens aceitas pelo serviço do Expo") long enviados,
        @Schema(description = "Mensagens recusadas ou que não chegaram ao Expo (falha de rede ou de serviço)")
        long falhos,
        @Schema(description = "Tokens desativados porque o Expo respondeu DeviceNotRegistered") long tokensDesativados,
        @Schema(description = "Pushes não enviados porque o mesmo ponto e tipo teve push há menos de intervalo_min")
        long seguradosPeloIntervalo,
        @Schema(description = "Ocorrências sem nenhum aparelho para receber") long semDestinatario,
        @Schema(description = "Envios descartados porque a fila do push estava cheia") long descartadosFilaCheia,
        @Schema(description = "Aparelhos ativos agora") long aparelhosAtivos,
        @Schema(description = "ps.push.intervalo-min") int intervaloMin) {
}
