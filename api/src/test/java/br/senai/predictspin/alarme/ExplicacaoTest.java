package br.senai.predictspin.alarme;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.referencia.Medida;

class ExplicacaoTest {

    @Test
    void textoProntoComAsTresMaioresAcimaDoTipico() {
        List<Explicacao.Item> itens = List.of(
                new Explicacao.Item("B", Medida.RMS_G, 4.24, 0.12, 0.08, 1120),
                new Explicacao.Item("B", Medida.O1X, 2.0, 0.05, 0.04, 1120),
                new Explicacao.Item("A", Medida.PICO_G, 5.1, 0.5, 0.3, 1120),
                new Explicacao.Item("C", Medida.CURTOSE, 3.0, 4, 3, 1120),
                new Explicacao.Item("C", Medida.RMS_G, -2.0, 0.02, 0.03, 1120));
        assertThat(Explicacao.texto(itens, false)).isEqualTo("A·pico 5,1σ acima do típico da marcha 1120; "
                + "B·RMS 4,2σ acima do típico da marcha 1120; C·curtose 3,0σ acima do típico da marcha 1120.");
        assertThat(Explicacao.texto(itens.subList(0, 1), true)).endsWith(Explicacao.DICA_SENSOR);
        assertThat(Explicacao.texto(List.of(itens.get(4)), false)).isNull();
    }

    @Test
    void paradoEDiferencaPercentual() {
        Explicacao.Item parado = new Explicacao.Item("C", Medida.RMS_G, -3.0, 0.02, 0.04, 0);
        assertThat(parado.texto()).isEqualTo("C·RMS 3,0σ abaixo do típico com o torno parado");
        assertThat(parado.diferencaPct()).isEqualTo(-50.0);
        assertThat(new Explicacao.Item("C", Medida.O1X, 1, 0.1, 0, 0).diferencaPct()).isNull();
    }
}
