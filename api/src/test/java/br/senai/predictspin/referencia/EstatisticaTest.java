package br.senai.predictspin.referencia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class EstatisticaTest {

    @Test
    void resumoRobusto() {
        Estatistica.Resumo r = Estatistica.resumir(new double[] {5, 1, 3, 2, 4, 100});
        // ordenados 1 2 3 4 5 100: mediana 3,5; desvios 2,5 1,5 0,5 0,5 1,5 96,5 → MAD 1,5
        assertThat(r.n()).isEqualTo(6);
        assertThat(r.mediana()).isEqualTo(3.5);
        assertThat(r.sigma()).isCloseTo(1.4826 * 1.5, within(1e-12));
        // p95 por interpolação: posição 0,95 × 5 = 4,75 → 5 + 0,75 × 95
        assertThat(r.p95()).isCloseTo(76.25, within(1e-12));
    }

    @Test
    void umValorSo() {
        Estatistica.Resumo r = Estatistica.resumir(new double[] {0.08});
        assertThat(r.mediana()).isEqualTo(0.08);
        assertThat(r.sigma()).isZero();
        assertThat(r.p95()).isEqualTo(0.08);
    }

    @Test
    void semValoresEhErro() {
        assertThatThrownBy(() -> Estatistica.resumir(new double[0])).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sigmaEfetivoEhOMaiorDosTres() {
        assertThat(Estatistica.sigmaEfetivo(0.001, null, 0.05, 0.10)).isCloseTo(0.005, within(1e-12));
        assertThat(Estatistica.sigmaEfetivo(0.001, 0.02, 0.05, 0.10)).isEqualTo(0.02);
        assertThat(Estatistica.sigmaEfetivo(0.03, 0.02, 0.05, 0.10)).isEqualTo(0.03);
    }

    @Test
    void zNuloComSigmaZero() {
        assertThat(Estatistica.z(1, 0, 0)).isNull();
        assertThat(Estatistica.z(0.12, 0.10, 0.005)).isCloseTo(4.0, within(1e-9));
        assertThat(Estatistica.z(0.08, 0.10, 0.005)).isCloseTo(-4.0, within(1e-9));
    }
}
