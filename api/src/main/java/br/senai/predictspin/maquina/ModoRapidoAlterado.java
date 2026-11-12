package br.senai.predictspin.maquina;

import br.senai.predictspin.maquina.dto.ModoRapidoResposta;

/** Anunciado quando um usuário liga ou desliga o modo rápido de uma máquina. */
public record ModoRapidoAlterado(ModoRapidoResposta estado) {
}
