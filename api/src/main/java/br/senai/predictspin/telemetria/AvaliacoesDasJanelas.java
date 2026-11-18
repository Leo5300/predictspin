package br.senai.predictspin.telemetria;

import java.util.Collection;
import java.util.Map;

import br.senai.predictspin.telemetria.dto.UltimaJanelaResposta;

/**
 * Avaliação de cada ponto das janelas contra a referência. A telemetria só declara o que precisa; quem
 * implementa é o pacote da regra de alarme (assim a telemetria não depende dele).
 */
public interface AvaliacoesDasJanelas {

    /** Nenhuma avaliação (usado quando a regra de alarme não está no contexto, como em testes de unidade). */
    AvaliacoesDasJanelas NENHUMA = ids -> Map.of();

    /** janela → ponto (id) → avaliação; janela ou ponto sem avaliação ficam de fora. */
    Map<Long, Map<Long, UltimaJanelaResposta.Avaliacao>> das(Collection<Long> janelaIds);
}
