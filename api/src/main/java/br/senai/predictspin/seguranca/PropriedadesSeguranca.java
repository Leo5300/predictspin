package br.senai.predictspin.seguranca;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Parâmetros de segurança, todos vindos de variáveis de ambiente (ver .env.example). */
@ConfigurationProperties("predictspin.seguranca")
public record PropriedadesSeguranca(
        Jwt jwt,
        @DefaultValue List<String> corsOrigens,
        Login login,
        @DefaultValue("") String dispositivoSal) {

    public record Jwt(String segredo, @DefaultValue("86400000") long validadeMs) {
    }

    public record Login(
            @DefaultValue("5") int maxTentativasEmail,
            @DefaultValue("20") int maxTentativasIp,
            @DefaultValue("900") long janelaSegundos) {
    }
}
