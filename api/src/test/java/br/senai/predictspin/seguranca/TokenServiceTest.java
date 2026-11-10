package br.senai.predictspin.seguranca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

class TokenServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-10T12:00:00Z");

    @Test
    void emiteTokenAssinadoComAsClaimsDoUsuario() {
        SecretKey chave = new SecretKeySpec("segredo-de-teste-com-32-bytes-ou-mais!".getBytes(StandardCharsets.UTF_8),
                "HmacSHA256");
        var propriedades = new PropriedadesSeguranca(new PropriedadesSeguranca.Jwt("nao-usado-aqui", 3_600_000),
                List.of(), null, "");
        var servico = new TokenService(new NimbusJwtEncoder(new ImmutableSecret<>(chave)),
                Clock.fixed(AGORA, ZoneOffset.UTC), propriedades);
        Usuario usuario = mock(Usuario.class);
        when(usuario.getId()).thenReturn(42L);
        when(usuario.getPapel()).thenReturn(Papel.TECNICO);
        when(usuario.getEmail()).thenReturn("ana@x.com");
        when(usuario.getNome()).thenReturn("Ana");

        var emitido = servico.emitir(usuario);

        assertThat(emitido.expiraEm()).isEqualTo(AGORA.plusSeconds(3600));
        // sem validação de prazo: o relógio do teste é fixo; aqui interessa a assinatura e as claims
        var decoder = NimbusJwtDecoder.withSecretKey(chave).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(token -> org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.success());
        Jwt jwt = decoder.decode(emitido.token());
        assertThat(jwt.getSubject()).isEqualTo("42");
        assertThat(jwt.getClaimAsString("iss")).isEqualTo(SegurancaConfig.EMISSOR_JWT);
        assertThat(jwt.getClaimAsString(SegurancaConfig.CLAIM_PAPEL)).isEqualTo("TECNICO");
        assertThat(jwt.getClaimAsString("email")).isEqualTo("ana@x.com");
        assertThat(jwt.getClaimAsString("nome")).isEqualTo("Ana");
        assertThat(jwt.getIssuedAt()).isEqualTo(AGORA);
        assertThat(jwt.getExpiresAt()).isEqualTo(AGORA.plusSeconds(3600));
    }
}
