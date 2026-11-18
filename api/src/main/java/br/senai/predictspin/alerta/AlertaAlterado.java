package br.senai.predictspin.alerta;

import br.senai.predictspin.alerta.dto.AlertaEvento;

/** Anunciado quando um alerta muda; vira o evento "alerta" do fluxo ao vivo depois do commit. */
public record AlertaAlterado(Long maquinaId, boolean simulado, AlertaEvento evento) {
}
