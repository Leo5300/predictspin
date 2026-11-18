package br.senai.predictspin.ordemservico;

import br.senai.predictspin.ordemservico.dto.OrdemServicoEvento;

/** Anunciado quando uma OS abre ou muda; vira o evento "os" do fluxo ao vivo depois do commit. */
public record OrdemServicoAlterada(Long maquinaId, boolean simulado, OrdemServicoEvento evento) {
}
