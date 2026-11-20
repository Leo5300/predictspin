package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import org.junit.jupiter.api.Test;

/** Tendência com séries SINTÉTICAS: provam a conta, não o comportamento do torno. */
class TendenciaTest {

    private static List<Tendencia.Ponto> serie(int dias, double inicio, double porDia, double ruido, long semente) {
        Random r = new Random(semente);
        List<Tendencia.Ponto> s = new ArrayList<>();
        for (int d = 0; d < dias; d++) {
            s.add(new Tendencia.Ponto(d, inicio + porDia * d + ruido * r.nextGaussian()));
        }
        return s;
    }

    @Test
    void subindoDaUmaFaixaDeDias() {
        // começa em 100 e sobe 10 por dia: no 14º dia (dia 13) está em 100 + 10 × 13 = 230; limite 600
        var r = Tendencia.calcular(serie(14, 100, 10, 2, 1), 7, 600);
        assertThat(r.inclinacao()).isCloseTo(10, within(0.5));
        assertThat(r.minima()).isLessThan(r.inclinacao());
        assertThat(r.maxima()).isGreaterThan(r.inclinacao());
        // nível ~230, faltam ~370 a ~10/dia: cerca de 37 dias, numa faixa em volta
        assertThat(r.diasMin()).isLessThan(37).isPositive();
        assertThat(r.diasMax()).isGreaterThan(37);
        assertThat(r.texto()).startsWith("se continuar assim, entre ").endsWith(" dias até o limite");
    }

    @Test
    void estavelNaoTemEstimativa() {
        var r = Tendencia.calcular(serie(10, 200, 0, 0, 2), 7, 600);
        assertThat(r.inclinacao()).isZero();
        assertThat(r.diasMin()).isNull();
        assertThat(r.diasMax()).isNull();
        assertThat(r.texto()).isEqualTo("sem tendência de subida");
    }

    @Test
    void ruidosaSemSegurancaDaSoOMinimoOuNada() {
        var r = Tendencia.calcular(serie(8, 200, 2, 80, 3), 7, 600);
        assertThat(r.minima()).isNegative();
        assertThat(r.diasMax()).isNull();
        assertThat(r.texto()).satisfiesAnyOf(t -> assertThat(t).contains("sem segurança"),
                t -> assertThat(t).isEqualTo("sem tendência de subida"));
    }

    @Test
    void curtaDemaisNaoCalculaEAcimaDoLimiteAvisa() {
        assertThat(Tendencia.calcular(serie(6, 100, 50, 0, 4), 7, 600)).isNull();
        assertThat(Tendencia.calcular(serie(2, 100, 50, 0, 4), 1, 600)).isNull();
        var acima = Tendencia.calcular(serie(8, 700, 5, 0, 5), 7, 600);
        assertThat(acima.texto()).isEqualTo("já está no limite ou acima dele");
        assertThat(acima.diasMin()).isNull();
    }
}
