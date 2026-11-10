package br.senai.predictspin.seguranca;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class HashChaveDispositivoTest {

    private static HashChaveDispositivo comSal(String sal) {
        return new HashChaveDispositivo(new PropriedadesSeguranca(null, List.of(), null, sal));
    }

    @Test
    void hashEhSha256HexDeterministicoEDependeDoSal() {
        var hash = comSal("sal");
        assertThat(hash.calcular("chave")).hasSize(64).matches("[0-9a-f]{64}").isEqualTo(hash.calcular("chave"));
        assertThat(comSal("outro-sal").calcular("chave")).isNotEqualTo(hash.calcular("chave"));
        // sal ausente equivale a sal vazio
        assertThat(comSal(null).calcular("chave")).isEqualTo(comSal("").calcular("chave"));
        // valor de referência: SHA-256 da cadeia "abc" (vetor de teste da FIPS 180-2)
        assertThat(comSal("a").calcular("bc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    @Test
    void confereSoAChaveCerta() {
        var hash = comSal("sal");
        String armazenado = hash.calcular("chave-certa");
        assertThat(hash.confere("chave-certa", armazenado)).isTrue();
        assertThat(hash.confere("chave-errada", armazenado)).isFalse();
        assertThat(hash.confere(null, armazenado)).isFalse();
        assertThat(hash.confere("chave-certa", null)).isFalse();
    }
}
