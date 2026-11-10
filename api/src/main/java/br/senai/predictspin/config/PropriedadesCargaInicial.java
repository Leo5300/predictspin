package br.senai.predictspin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Dados criados na subida da aplicação, se ainda não existirem. Segredos vêm do ambiente. */
@ConfigurationProperties("predictspin.carga-inicial")
public record PropriedadesCargaInicial(
        @DefaultValue("TORNO-01") String maquinaCodigo,
        @DefaultValue("Administrador") String adminNome,
        String adminEmail,
        String adminSenha,
        @DefaultValue("ps-torno-01") String dispositivoReal,
        String chaveDispositivoReal,
        @DefaultValue("ps-sim-01") String dispositivoSimulado,
        String chaveDispositivoSimulado) {
}
