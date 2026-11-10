package br.senai.predictspin.seguranca;

import java.time.Clock;
import java.time.Instant;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** Emite o JWT do usuário: assunto = id, com papel, e-mail e nome como claims. */
@Service
public class TokenService {

    private final JwtEncoder encoder;
    private final Clock relogio;
    private final long validadeMs;

    public TokenService(JwtEncoder encoder, Clock relogio, PropriedadesSeguranca propriedades) {
        this.encoder = encoder;
        this.relogio = relogio;
        this.validadeMs = propriedades.jwt().validadeMs();
    }

    public TokenEmitido emitir(Usuario usuario) {
        Instant agora = relogio.instant();
        Instant expiraEm = agora.plusMillis(validadeMs);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(SegurancaConfig.EMISSOR_JWT)
                .subject(String.valueOf(usuario.getId()))
                .issuedAt(agora)
                .expiresAt(expiraEm)
                .claim(SegurancaConfig.CLAIM_PAPEL, usuario.getPapel().name())
                .claim("email", usuario.getEmail())
                .claim("nome", usuario.getNome())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new TokenEmitido(token, expiraEm);
    }

    public record TokenEmitido(String token, Instant expiraEm) {
    }
}
