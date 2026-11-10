package br.senai.predictspin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

class UrlDoBancoTest {

    @Test
    void converteAUrlCompleta() {
        var propriedades = UrlDoBanco.converter("postgresql://predictspin:s3nha@banco.interno:6543/predictspin");

        assertThat(propriedades)
                .containsEntry("spring.datasource.url", "jdbc:postgresql://banco.interno:6543/predictspin")
                .containsEntry("spring.datasource.username", "predictspin")
                .containsEntry("spring.datasource.password", "s3nha");
    }

    @Test
    void semPortaUsaAPadraoEAceitaOEsquemaCurto() {
        var propriedades = UrlDoBanco.converter("  postgres://usuario:senha@dpg-abc123-a/predictspin_x1  ");

        assertThat(propriedades).containsEntry("spring.datasource.url",
                "jdbc:postgresql://dpg-abc123-a:5432/predictspin_x1");
    }

    @Test
    void decodificaCredenciaisEMantemOsParametros() {
        var propriedades = UrlDoBanco.converter("postgresql://ana%40x:a%3Ab%2Fc+d@host/banco?sslmode=require");

        assertThat(propriedades)
                .containsEntry("spring.datasource.url", "jdbc:postgresql://host:5432/banco?sslmode=require")
                .containsEntry("spring.datasource.username", "ana@x")
                .containsEntry("spring.datasource.password", "a:b/c+d");
    }

    @Test
    void semCredenciaisSoDefineAUrl() {
        assertThat(UrlDoBanco.converter("postgresql://host/banco")).containsOnlyKeys("spring.datasource.url");
        assertThat(UrlDoBanco.converter("postgresql://usuario@host/banco"))
                .containsOnlyKeys("spring.datasource.url", "spring.datasource.username");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "mysql://usuario:Xy9segredo@host/banco",
            "jdbc:postgresql://host/banco",
            "postgresql://usuario:Xy9segredo@host",
            "postgresql://usuario:Xy9segredo@host/",
            "postgresql:///banco",
            "postgresql://usuario:Xy9 segredo@host/banco",
            "banco"
    })
    void urlInvalidaEhRecusadaSemExporOValor(String url) {
        assertThatThrownBy(() -> UrlDoBanco.converter(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DATABASE_URL inválida")
                .hasMessageNotContaining("segredo");
    }

    @Test
    void comAVariavelDefinidaAUrlPrevaleceSobreAsDemais() {
        var ambiente = new MockEnvironment()
                .withProperty("spring.datasource.url", "jdbc:postgresql://localhost:5432/outro")
                .withProperty("DATABASE_URL", "postgresql://u:p@host:5433/banco");

        new UrlDoBanco().postProcessEnvironment(ambiente, null);

        assertThat(ambiente.getProperty("spring.datasource.url")).isEqualTo("jdbc:postgresql://host:5433/banco");
        assertThat(ambiente.getProperty("spring.datasource.username")).isEqualTo("u");
        assertThat(ambiente.getProperty("spring.datasource.password")).isEqualTo("p");
    }

    @Test
    void semAVariavelNadaMuda() {
        var ambiente = new MockEnvironment().withProperty("DATABASE_URL", " ");

        new UrlDoBanco().postProcessEnvironment(ambiente, null);

        assertThat(ambiente.getPropertySources().contains(UrlDoBanco.FONTE)).isFalse();
    }
}
