package br.senai.predictspin.seguranca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import br.senai.predictspin.RelogioAjustavel;
import br.senai.predictspin.comum.MuitasTentativasException;

class LimiteTentativasServiceTest {

    private RelogioAjustavel relogio;
    private LimiteTentativasService limite;

    @BeforeEach
    void criar() {
        relogio = new RelogioAjustavel(Instant.parse("2026-11-10T12:00:00Z"));
        var propriedades = new PropriedadesSeguranca(new PropriedadesSeguranca.Jwt("x", 1000), List.of(),
                new PropriedadesSeguranca.Login(3, 5, 600), "");
        limite = new LimiteTentativasService(relogio, propriedades);
    }

    @Test
    void bloqueiaEmailAoAtingirOLimiteEInformaQuantoEsperar() {
        for (int i = 0; i < 3; i++) {
            limite.verificar("1.1.1.1", "a@x.com");
            limite.registrarFalha("1.1.1.1", "a@x.com");
            relogio.avancar(Duration.ofSeconds(10));
        }
        assertThatThrownBy(() -> limite.verificar("2.2.2.2", "A@X.com"))
                .isInstanceOf(MuitasTentativasException.class)
                .satisfies(e -> assertThat(((MuitasTentativasException) e).getSegundosParaNovaTentativa())
                        .isEqualTo(600 - 30));
    }

    @Test
    void liberaQuandoAFalhaMaisAntigaSaiDaJanela() {
        for (int i = 0; i < 3; i++) {
            limite.registrarFalha("1.1.1.1", "a@x.com");
        }
        relogio.avancar(Duration.ofSeconds(599));
        assertThatThrownBy(() -> limite.verificar("1.1.1.1", "a@x.com")).isInstanceOf(MuitasTentativasException.class);
        relogio.avancar(Duration.ofSeconds(1));
        assertThatCode(() -> limite.verificar("1.1.1.1", "a@x.com")).doesNotThrowAnyException();
    }

    @Test
    void sucessoZeraFalhasDoEmailMasNaoDoIp() {
        for (int i = 0; i < 2; i++) {
            limite.registrarFalha("9.9.9.9", "b@x.com");
        }
        limite.registrarSucesso("b@x.com");
        limite.registrarFalha("9.9.9.9", "b@x.com");
        limite.registrarFalha("9.9.9.9", "b@x.com");
        assertThatCode(() -> limite.verificar("8.8.8.8", "b@x.com")).doesNotThrowAnyException();
        limite.registrarFalha("9.9.9.9", "c@x.com");
        // IP acumulou 5 falhas
        assertThatThrownBy(() -> limite.verificar("9.9.9.9", "outro@x.com"))
                .isInstanceOf(MuitasTentativasException.class);
    }

    @Test
    void limpezaRemoveEntradasExpiradas() {
        limite.registrarFalha("1.1.1.1", "a@x.com");
        limite.registrarFalha("1.1.1.1", "a@x.com");
        limite.registrarFalha("1.1.1.1", "a@x.com");
        relogio.avancar(Duration.ofMinutes(11));
        limite.limparExpiradas();
        assertThatCode(() -> limite.verificar("1.1.1.1", "a@x.com")).doesNotThrowAnyException();
    }
}
