package br.senai.predictspin.telemetria;

import br.senai.predictspin.telemetria.dto.EventoMarcadoResposta;

/** Anunciado quando um evento é marcado num ensaio aberto (vai ao fluxo ao vivo depois do commit). */
public record EventoMarcadoGravado(Long maquinaId, boolean simulado, EventoMarcadoResposta evento) {
}
