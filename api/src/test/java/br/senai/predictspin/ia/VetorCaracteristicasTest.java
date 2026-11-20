package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;
import br.senai.predictspin.telemetria.IngestaoRepository.LinhaTelemetria;
import br.senai.predictspin.telemetria.ModoJanela;

class VetorCaracteristicasTest {

    static final Map<String, Long> PONTOS = Map.of("A", 1L, "B", 2L, "C", 3L);
    static final List<Integer> MARCHAS = List.of(450, 1120);
    static final PropriedadesReferencia PROP = new PropriedadesReferencia(24, 0.05, 0.10, 0.98,
            new PropriedadesReferencia.Deriva(true, 7, 0.30));

    /** Referência T1 e T3 genérica a 1120 rpm, mediana 0,10 em tudo, sigma efetivo 0,01; T3 também com receita. */
    static ReferenciaAtiva referencia(String calibracao) {
        List<CelulaGravada> c = new ArrayList<>();
        for (long p = 1; p <= 3; p++) {
            for (Medida m : Medida.values()) {
                for (String etapa : List.of("T1", "T3")) {
                    c.add(new CelulaGravada(0, p, "?", m, 1120, etapa, false, null, null, 30, 0, 0.10, 0.01, 0.12, null,
                            0.01, true, calibracao, "fw"));
                }
                // receita do corte com outra mediana: o vetor NÃO pode usar esta célula
                c.add(new CelulaGravada(0, p, "?", m, 1120, "T3", true, 7L, null, 30, 0, 0.50, 0.01, 0.6, null, 0.01,
                        true, calibracao, "fw"));
            }
        }
        return new ReferenciaAtiva(10, 3, c);
    }

    static LinhaTelemetria linha(long ponto, double v, Double vel) {
        return new LinhaTelemetria(ponto, v, v, v, v, v, v, vel);
    }

    static VetorCaracteristicas.Janela janela(double rpm, ModoJanela modo, String etapa, Map<String, LinhaTelemetria> l,
                                              String calibracao) {
        String cal = calibracao == null ? null
                : "{\"A\":\"" + calibracao + "\",\"B\":\"" + calibracao + "\",\"C\":\"" + calibracao + "\"}";
        return new VetorCaracteristicas.Janela(rpm, false, modo, 8000, 8000, cal, etapa, false, PONTOS, l,
                Map.of("temp_cabecote_c", 31.5, "nivel_som_db", 70.25));
    }

    static Map<String, LinhaTelemetria> tres(double a, double b, double c, Double vel) {
        Map<String, LinhaTelemetria> m = new HashMap<>();
        m.put("A", linha(1, a, vel));
        m.put("B", linha(2, b, vel));
        m.put("C", linha(3, c, vel));
        return m;
    }

    @Test
    void nomesNaOrdemDaVersaoV1() {
        List<String> nomes = VetorCaracteristicas.nomes(List.of());
        assertThat(nomes).hasSize(25);
        assertThat(nomes.subList(0, 7)).containsExactly("z_A_rms_g", "z_A_pico_g", "z_A_curtose", "z_A_o1x", "z_A_o2x",
                "z_A_o3x", "z_A_vel_rms_mm_s");
        assertThat(nomes.subList(21, 25)).containsExactly("log_rms_b_a", "log_rms_c_a", "marcha_rpm", "etapa_t3");
        assertThat(VetorCaracteristicas.nomes(List.of("nivel_som_db"))).hasSize(26).last()
                .isEqualTo("canal_nivel_som_db");
        assertThat(VetorCaracteristicas.VERSAO).isEqualTo("v1");
    }

    @Test
    void zContraAReferenciaDaEtapaSemAReceitaCortadoEm50() {
        // B a 0,13: z = 3; C a 2,0: z = 190, cortado em 50; A no típico
        var r = VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T3", tres(0.10, 0.13, 2.0, 0.10), "c1"),
                referencia("c1"), MARCHAS, PROP, List.of());
        assertThat(r.temVetor()).isTrue();
        Map<String, Integer> pos = VetorCaracteristicas.posicoes(r.nomes());
        double[] v = r.valores();
        assertThat(v[pos.get("z_A_rms_g")]).isCloseTo(0.0, within(1e-6));
        assertThat(v[pos.get("z_B_rms_g")]).isCloseTo(3.0, within(1e-5));
        assertThat(v[pos.get("z_C_pico_g")]).isEqualTo(50.0);
        // log((B + 1e-6) / (A + 1e-6)): o epsilon que evita divisão por zero muda a 6ª casa
        assertThat(v[pos.get("log_rms_b_a")]).isCloseTo(Math.log(1.3), within(1e-5));
        assertThat(v[pos.get("log_rms_c_a")]).isCloseTo(Math.log(20.0), within(1e-5));
        assertThat(v[pos.get("marcha_rpm")]).isEqualTo(1120);
        assertThat(v[pos.get("etapa_t3")]).isEqualTo(1);
        // valores são float: o mesmo número que as árvores comparam
        assertThat(v[pos.get("z_B_rms_g")]).isEqualTo((double) (float) v[pos.get("z_B_rms_g")]);
        assertThat(r.zPorNome()).containsKey("z_B_rms_g").doesNotContainKey("marcha_rpm");
        assertThat(VetorCaracteristicas.valor(r, "z_B_rms_g")).isPresent();
        assertThat(VetorCaracteristicas.valor(r, "nao_existe")).isEmpty();
    }

    @Test
    void giroEmVazioDentroDeEnsaioT1ETarefaT2UsamT1() {
        var t1 = VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T1", tres(0.1, 0.1, 0.1, 0.1), null),
                referencia(null), MARCHAS, PROP, List.of());
        assertThat(t1.valores()[VetorCaracteristicas.posicoes(t1.nomes()).get("etapa_t3")]).isZero();
        var t2 = VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T2", tres(0.1, 0.1, 0.1, 0.1), null),
                referencia(null), MARCHAS, PROP, List.of());
        assertThat(t2.temVetor()).isTrue();
        // fora de ensaio: a escolha da regra (T1 ou T3)
        var uso = VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, null, tres(0.1, 0.1, 0.1, 0.1), null),
                referencia(null), MARCHAS, PROP, List.of());
        assertThat(uso.temVetor()).isTrue();
    }

    @Test
    void velocidadeAusenteFicaNaNEOsCanaisSoSeHabilitados() {
        var r = VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T3", tres(0.1, 0.1, 0.1, null), null),
                referencia(null), MARCHAS, PROP, List.of("nivel_som_db", "temp_ferramenta_c"));
        Map<String, Integer> pos = VetorCaracteristicas.posicoes(r.nomes());
        assertThat(r.valores()[pos.get("z_A_vel_rms_mm_s")]).isNaN();
        assertThat(r.valores()[pos.get("canal_nivel_som_db")]).isEqualTo(70.25);
        // habilitado mas ausente na janela: NaN (o modelo que exige o canal não roda)
        assertThat(r.valores()[pos.get("canal_temp_ferramenta_c")]).isNaN();
        assertThat(r.nomes()).doesNotContain("canal_temp_cabecote_c");
    }

    @Test
    void semVetorComOMotivo() {
        ReferenciaAtiva ref = referencia("c1");
        assertThat(VetorCaracteristicas.montar(janela(1120, ModoJanela.RAPIDO, "T3", tres(0.1, 0.1, 0.1, 0.1), "c1"),
                ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("modo_rapido");
        assertThat(VetorCaracteristicas.montar(janela(0, ModoJanela.NORMAL, "T3", tres(0.1, 0.1, 0.1, 0.1), "c1"),
                ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("parado");
        assertThat(VetorCaracteristicas.montar(janela(800, ModoJanela.NORMAL, "T3", tres(0.1, 0.1, 0.1, 0.1), "c1"),
                ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("fora_da_marcha");
        assertThat(VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T3", tres(0.1, 0.1, 0.1, 0.1), "c2"),
                ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("calibracao_diferente");
        assertThat(VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T3", tres(0.1, 0.1, 0.1, 0.1), "c1"),
                null, MARCHAS, PROP, List.of()).motivo()).isEqualTo("sem_referencia_completa");
        Map<String, LinhaTelemetria> semC = tres(0.1, 0.1, 0.1, 0.1);
        semC.remove("C");
        assertThat(VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T3", semC, "c1"), ref, MARCHAS, PROP,
                List.of()).motivo()).isEqualTo("sem_referencia_completa");
        var saturada = new VetorCaracteristicas.Janela(1120, true, ModoJanela.NORMAL, 8000, 8000, null, "T3", false,
                PONTOS, tres(0.1, 0.1, 0.1, 0.1), Map.of());
        assertThat(VetorCaracteristicas.montar(saturada, ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("saturou");
        // marcha sem célula (450): o ponto fica sem referência
        assertThat(VetorCaracteristicas.montar(janela(450, ModoJanela.NORMAL, "T3", tres(0.1, 0.1, 0.1, 0.1), "c1"),
                ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("sem_referencia_completa");
        // T0 dentro de ensaio com o eixo girando: não é T1 nem T3
        assertThat(VetorCaracteristicas.montar(janela(1120, ModoJanela.NORMAL, "T0", tres(0.1, 0.1, 0.1, 0.1), "c1"),
                ref, MARCHAS, PROP, List.of()).motivo()).isEqualTo("sem_referencia_completa");
    }
}
