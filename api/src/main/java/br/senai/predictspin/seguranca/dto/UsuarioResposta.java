package br.senai.predictspin.seguranca.dto;

import java.time.Instant;

import br.senai.predictspin.seguranca.Papel;
import br.senai.predictspin.seguranca.Usuario;

public record UsuarioResposta(Long id, String nome, String email, Papel papel, boolean ativo, Instant criadoEm) {

    public static UsuarioResposta de(Usuario u) {
        return new UsuarioResposta(u.getId(), u.getNome(), u.getEmail(), u.getPapel(), u.isAtivo(), u.getCriadoEm());
    }
}
