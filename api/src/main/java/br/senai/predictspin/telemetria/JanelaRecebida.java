package br.senai.predictspin.telemetria;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Anunciado pela ingestão para toda janela NOVA (ao vivo ou recuperada). Quem escuta (a avaliação contra a
 * referência) age DEPOIS do commit, em transação própria: a janela fica gravada e a resposta do POST é a
 * mesma, mesmo que a avaliação falhe.
 *
 * @param aoVivo        false quando medido_em é mais antigo que o limite do ao vivo (fila do dispositivo)
 * @param pontosAtivos  código → id de todos os pontos ativos da máquina (os ausentes do envio também)
 */
public record JanelaRecebida(Long maquinaId, boolean simulado, long janelaId, Instant medidoEm, boolean aoVivo,
                             double rotacaoRpm, boolean saturou, ModoJanela modo, Integer amostras,
                             Integer amostrasEsperadas, String firmwareVersao, String calibracaoJson, Long ensaioId,
                             Map<String, Long> pontosAtivos, List<IngestaoRepository.LinhaTelemetria> linhas) {
}
