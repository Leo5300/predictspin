package br.senai.predictspin.seguranca.dto;

import java.time.Instant;

public record LoginResposta(String token, String tipo, Instant expiraEm, UsuarioResposta usuario) {
}
