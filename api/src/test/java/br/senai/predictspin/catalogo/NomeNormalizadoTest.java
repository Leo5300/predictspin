package br.senai.predictspin.catalogo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class NomeNormalizadoTest {

    @Test
    void ignoraMaiusculasAcentosPontuacaoEEspacosExtras() {
        assertThat(NomeNormalizado.de("  Aço SAE-1045 ")).isEqualTo("aco sae 1045");
        assertThat(NomeNormalizado.de("aco   sae.1045")).isEqualTo("aco sae 1045");
        assertThat(NomeNormalizado.de("Bit de metal duro, ângulo 60°")).isEqualTo("bit de metal duro angulo 60");
        assertThat(NomeNormalizado.de("---")).isEmpty();
        assertThat(NomeNormalizado.de(null)).isEmpty();
    }

    @Test
    void exibicaoSoColapsaEspacos() {
        assertThat(NomeNormalizado.exibicao("  Aço   SAE 1045 ")).isEqualTo("Aço SAE 1045");
        assertThat(NomeNormalizado.exibicao(null)).isEmpty();
    }
}
