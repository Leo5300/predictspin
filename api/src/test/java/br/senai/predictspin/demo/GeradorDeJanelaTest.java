package br.senai.predictspin.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.function.Function;

import jakarta.validation.Validation;

import org.junit.jupiter.api.Test;

import br.senai.predictspin.alarme.Avaliador;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.alarme.Situacao;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao.MedidaPonto;

class GeradorDeJanelaTest {

    private static final int JANELAS = 400;
    private static final Instant T = Instant.parse("2026-11-27T13:00:00Z");

    private final PropriedadesAlarme limites = new PropriedadesAlarme(3, 5, 15, 1, 15, 30, 0.5, 24, 10, 3, 24,
            List.of(15, 60, 240, 1440), 10080);
    private final ReferenciaAtiva ref = ReferenciaDeTeste.padrao();

    /** O avaliador de verdade: T1 e T3 genérico, fica a de menor pior z (a interpretação mais normal). */
    private Avaliador.Resultado avaliar(TelemetriaRequisicao req, String ponto, ReferenciaAtiva referencia) {
        MedidaPonto m = req.pontos().get(ponto);
        Function<Medida, Double> valores = medida -> switch (medida) {
            case RMS_G -> m.rmsG();
            case PICO_G -> m.picoG();
            case CURTOSE -> m.curtose();
            case O1X -> m.o1x();
            case O2X -> m.o2x();
            case O3X -> m.o3x();
            case VEL_RMS_MM_S -> m.velRmsMmS();
        };
        String calibracao = req.calibracao() == null ? null : req.calibracao().get(ponto);
        var ctx = new Avaliador.Contexto(ReferenciaDeTeste.MARCHA, false, null, null, null, calibracao);
        return Avaliador.avaliar(referencia, ReferenciaDeTeste.PONTOS.get(ponto), ctx, valores, false);
    }

    private Avaliador.Resultado avaliar(TelemetriaRequisicao req, String ponto) {
        return avaliar(req, ponto, ref);
    }

    private TelemetriaRequisicao janela(NivelDemo nivel, ReferenciaAtiva referencia, Random rng) {
        return GeradorDeJanela.montar("ps-sim-01", T, nivel, referencia, ReferenciaDeTeste.PONTOS,
                ReferenciaDeTeste.MARCHA, 1120, limites, rng, null);
    }

    private void confere(NivelDemo nivel, double[] faixaA, double[] faixaB, double[] faixaC) {
        Random rng = new Random(7);
        for (int i = 0; i < JANELAS; i++) {
            TelemetriaRequisicao req = janela(nivel, ref, rng);
            assertThat(avaliar(req, "A").zMax()).as("A %s janela %d", nivel, i)
                    .isBetween(faixaA[0] - 0.02, faixaA[1] + 0.02);
            assertThat(avaliar(req, "B").zMax()).as("B %s janela %d", nivel, i)
                    .isBetween(faixaB[0] - 0.02, faixaB[1] + 0.02);
            assertThat(avaliar(req, "C").zMax()).as("C %s janela %d", nivel, i)
                    .isBetween(faixaC[0] - 0.02, faixaC[1] + 0.02);
        }
    }

    private static final double[] NORMAL = {-1.0, 1.5};

    @Test
    void faixasSaemDosLimitesReaisENaoDeNumerosFixos() {
        var normal = GeradorDeJanela.faixas(NivelDemo.NORMAL, limites);
        assertThat(normal.get("A").min()).isCloseTo(-1.0, within(1e-9));
        assertThat(normal.get("A").max()).isCloseTo(1.5, within(1e-9));
        var atencao = GeradorDeJanela.faixas(NivelDemo.ATENCAO, limites);
        assertThat(atencao.get("A").min()).isCloseTo(3.5, within(1e-9));
        assertThat(atencao.get("A").max()).isCloseTo(4.5, within(1e-9));
        assertThat(atencao.get("B").min()).isCloseTo(1.2, within(1e-9));
        assertThat(atencao.get("B").max()).isCloseTo(1.8, within(1e-9));
        var alarme = GeradorDeJanela.faixas(NivelDemo.ALARME, limites);
        assertThat(alarme.get("A").min()).isCloseTo(6.0, within(1e-9));
        assertThat(alarme.get("A").max()).isCloseTo(8.0, within(1e-9));
        assertThat(alarme.get("B").min()).isCloseTo(3.5, within(1e-9));
        assertThat(alarme.get("B").max()).isCloseTo(4.0, within(1e-9));

        // limites diferentes mudam as faixas: nada está escrito à mão
        var outros = new PropriedadesAlarme(2, 6, 15, 1, 15, 30, 0.5, 24, 10, 3, 24, List.of(15), 10080);
        var alarmeOutros = GeradorDeJanela.faixas(NivelDemo.ALARME, outros);
        assertThat(alarmeOutros.get("A").min()).isCloseTo(8.0, within(1e-9));
        assertThat(alarmeOutros.get("A").max()).isCloseTo(12.0, within(1e-9));
        assertThat(alarmeOutros.get("B").max()).isLessThan(outros.zAlarme());
        assertThat(alarmeOutros.get("B").min()).isGreaterThanOrEqualTo(outros.zAtencao());
    }

    @Test
    void normalDeixaABeCEntreMenos1eMais1virgula5() {
        confere(NivelDemo.NORMAL, NORMAL, NORMAL, NORMAL);
    }

    @Test
    void atencaoSobeOASem3_5a4_5EDeixaBEmUmEMeioECNormal() {
        confere(NivelDemo.ATENCAO, new double[] {3.5, 4.5}, new double[] {1.2, 1.8}, NORMAL);
    }

    @Test
    void alarmeLevaAde6a8BEmAtencaoECNormal() {
        confere(NivelDemo.ALARME, new double[] {6.0, 8.0}, new double[] {3.5, 4.0}, NORMAL);
    }

    @Test
    void aClassificacaoDaApiBateComONivelPedido() {
        Random rng = new Random(3);
        for (int i = 0; i < JANELAS; i++) {
            var normal = janela(NivelDemo.NORMAL, ref, rng);
            for (String ponto : List.of("A", "B", "C")) {
                assertThat(limites.nivelBruto(avaliar(normal, ponto).zMax()).name()).isEqualTo("NORMAL");
            }
            var atencao = janela(NivelDemo.ATENCAO, ref, rng);
            assertThat(limites.nivelBruto(avaliar(atencao, "A").zMax()).name()).isEqualTo("ATENCAO");
            assertThat(limites.nivelBruto(avaliar(atencao, "B").zMax()).name()).isEqualTo("NORMAL");
            assertThat(limites.nivelBruto(avaliar(atencao, "C").zMax()).name()).isEqualTo("NORMAL");
            var alarme = janela(NivelDemo.ALARME, ref, rng);
            assertThat(limites.nivelBruto(avaliar(alarme, "A").zMax()).name()).isEqualTo("ALARME");
            assertThat(limites.nivelBruto(avaliar(alarme, "B").zMax()).name()).isEqualTo("ATENCAO");
            assertThat(limites.nivelBruto(avaliar(alarme, "C").zMax()).name()).isEqualTo("NORMAL");
        }
    }

    @Test
    void noPontoElevadoORmsEAMedidaDominanteEAsOutrasAcompanham() {
        Random rng = new Random(11);
        for (int i = 0; i < 100; i++) {
            Avaliador.Resultado r = avaliar(janela(NivelDemo.ALARME, ref, rng), "A");
            assertThat(r.dominante()).isEqualTo(Medida.RMS_G);
            // pico, 1X, 3X e velocidade sobem junto (z alto), a curtose um pouco menos
            assertThat(r.z().get(Medida.PICO_G)).isGreaterThan(4.0);
            assertThat(r.z().get(Medida.O1X)).isGreaterThan(4.5);
            assertThat(r.z().get(Medida.O3X)).isGreaterThan(3.0);
            assertThat(r.z().get(Medida.VEL_RMS_MM_S)).isGreaterThan(4.0);
            assertThat(r.z().get(Medida.CURTOSE)).isGreaterThan(2.0);
        }
    }

    @Test
    void valeMesmoQuandoOT1ValeMaisQueOT3() {
        // T1 maior que o T3 e σ pequeno: o maior valor entre as duas referências mantém o z contra as duas
        ReferenciaAtiva invertida = ReferenciaDeTeste.com(new double[] {0.20, 0.16, 0.08},
                new double[] {0.10, 0.08, 0.04}, 0.05, true);
        Random rng = new Random(5);
        for (int i = 0; i < 200; i++) {
            var req = janela(NivelDemo.ALARME, invertida, rng);
            assertThat(avaliar(req, "A", invertida).zMax()).isBetween(6.0 - 0.02, 8.0 + 0.02);
            assertThat(avaliar(req, "B", invertida).zMax()).isBetween(3.5 - 0.02, 4.0 + 0.02);
            assertThat(avaliar(req, "C", invertida).zMax()).isBetween(-1.0 - 0.02, 1.5 + 0.02);
        }
    }

    @Test
    void valeQuandoOT1EOT3SeCruzamDeUmaMedidaParaOutra() {
        // com a escolha da etapa medida a medida, o pior z chegava a 0,9 acima do sorteado e o ATENÇÃO virava ALARME
        ReferenciaAtiva cruzada = ReferenciaDeTeste.cruzada();
        Random rng = new Random(21);
        for (int i = 0; i < JANELAS; i++) {
            var normal = janela(NivelDemo.NORMAL, cruzada, rng);
            for (String ponto : List.of("A", "B", "C")) {
                assertThat(avaliar(normal, ponto, cruzada).zMax()).as("NORMAL %s", ponto)
                        .isBetween(-1.0 - 0.02, 1.5 + 0.02);
            }
            var atencao = janela(NivelDemo.ATENCAO, cruzada, rng);
            assertThat(avaliar(atencao, "A", cruzada).zMax()).as("ATENCAO A").isBetween(3.5 - 0.02, 4.5 + 0.02);
            assertThat(avaliar(atencao, "B", cruzada).zMax()).as("ATENCAO B").isBetween(1.2 - 0.02, 1.8 + 0.02);
            var alarme = janela(NivelDemo.ALARME, cruzada, rng);
            assertThat(avaliar(alarme, "A", cruzada).zMax()).as("ALARME A").isBetween(6.0 - 0.02, 8.0 + 0.02);
            assertThat(avaliar(alarme, "B", cruzada).zMax()).as("ALARME B").isBetween(3.5 - 0.02, 4.0 + 0.02);
            assertThat(avaliar(alarme, "C", cruzada).zMax()).as("ALARME C").isBetween(-1.0 - 0.02, 1.5 + 0.02);
        }
    }

    @Test
    void aJanelaSegueOFormatoDoSimuladorEPassaNaValidacaoDoContrato() {
        var validador = Validation.buildDefaultValidatorFactory().getValidator();
        Random rng = new Random(1);
        for (NivelDemo nivel : List.of(NivelDemo.NORMAL, NivelDemo.ATENCAO, NivelDemo.ALARME)) {
            TelemetriaRequisicao req = janela(nivel, ref, rng);
            assertThat(validador.validate(req)).as("violações %s", nivel).isEmpty();
            assertThat(req.dispositivo()).isEqualTo("ps-sim-01");
            assertThat(req.firmwareVersao()).isEqualTo("simulado");
            assertThat(req.rotacaoRpm()).isBetween(1100.0, 1120.0);
            assertThat(req.saturou()).isFalse();
            assertThat(req.pontos()).containsOnlyKeys("A", "B", "C");
            // a calibração é a da referência: sem isso o ponto ficaria "calibração diferente"
            assertThat(req.calibracao()).containsEntry("A", "simulada").containsEntry("C", "simulada");
            assertThat(req.amostrasEsperadas()).isEqualTo(8000);
            assertThat(req.amostras()).isBetween(7998, 8000);
            assertThat(req.canais()).containsKeys("temp_cabecote_c", "corrente_a", "amb_temp_c");
            req.pontos().values().forEach(m -> {
                assertThat(m.rmsG()).isPositive();
                assertThat(m.curtose()).isGreaterThanOrEqualTo(1.0);
            });
            assertThat(avaliar(req, "A").situacao()).isEqualTo(Situacao.AVALIADA);
        }
    }

    @Test
    void asJanelasVariamEntreSiEDependemSoDaSemente() {
        var a = janela(NivelDemo.NORMAL, ref, new Random(42));
        var b = janela(NivelDemo.NORMAL, ref, new Random(42));
        assertThat(a.pontos().get("A").rmsG()).isEqualTo(b.pontos().get("A").rmsG());
        Random rng = new Random(42);
        double primeira = janela(NivelDemo.NORMAL, ref, rng).pontos().get("A").rmsG();
        double segunda = janela(NivelDemo.NORMAL, ref, rng).pontos().get("A").rmsG();
        assertThat(segunda).isNotEqualTo(primeira);
    }

    @Test
    void referenciaIncompletaListaOQueFalta() {
        assertThat(GeradorDeJanela.faltas(ref, ReferenciaDeTeste.PONTOS, ReferenciaDeTeste.MARCHA)).isEmpty();
        // outra marcha: nada da referência vale
        assertThat(GeradorDeJanela.faltas(ref, ReferenciaDeTeste.PONTOS, 900)).hasSize(6)
                .anyMatch(f -> f.startsWith("ponto A no T1")).anyMatch(f -> f.startsWith("ponto C no T3"));
        // sem a velocidade ainda pode: ela é opcional
        ReferenciaAtiva semVelocidade = ReferenciaDeTeste.com(new double[] {0.1, 0.08, 0.04},
                new double[] {0.14, 0.2, 0.06}, 0.08, false);
        assertThat(GeradorDeJanela.faltas(semVelocidade, ReferenciaDeTeste.PONTOS, ReferenciaDeTeste.MARCHA))
                .isEmpty();
        var req = janela(NivelDemo.ALARME, semVelocidade, new Random(2));
        assertThat(req.pontos().get("A").velRmsMmS()).isNull();
    }

    @Test
    void zNegativoNuncaViraSinalSumido() {
        // σ de 60% da mediana: z = −1 daria 40% do típico, abaixo do limite de "sinal sumido" (50%)
        ReferenciaAtiva larga = ReferenciaDeTeste.com(new double[] {0.10, 0.08, 0.04},
                new double[] {0.14, 0.20, 0.06}, 0.6, true);
        Random rng = new Random(9);
        for (int i = 0; i < 200; i++) {
            var req = janela(NivelDemo.NORMAL, larga, rng);
            req.pontos().forEach((ponto, m) -> {
                long id = ReferenciaDeTeste.PONTOS.get(ponto);
                double tipicoRms = Math.max(
                        larga.celula(id, Medida.RMS_G, ReferenciaDeTeste.MARCHA, "T1").orElseThrow().mediana(),
                        larga.celula(id, Medida.RMS_G, ReferenciaDeTeste.MARCHA, "T3").orElseThrow().mediana());
                assertThat(m.rmsG()).isGreaterThanOrEqualTo(0.6 * tipicoRms - 1e-5);
                assertThat(m.o1x()).isPositive();
            });
        }
    }
}
