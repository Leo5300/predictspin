package br.senai.predictspin.demo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;

/** Referência simulada de teste: A, B e C a 1120 rpm, T1 (em vazio) e T3 (corte), com calibração "simulada". */
final class ReferenciaDeTeste {

    static final int MARCHA = 1120;
    static final String CALIBRACAO = "simulada";
    static final Map<String, Long> PONTOS = Map.of("A", 1L, "B", 2L, "C", 3L);

    private ReferenciaDeTeste() {
    }

    /** RMS típico de cada ponto no T1 e no T3; as outras medidas são proporcionais. */
    static ReferenciaAtiva padrao() {
        return com(new double[] {0.10, 0.08, 0.04}, new double[] {0.14, 0.20, 0.06}, 0.08, true);
    }

    /**
     * T1 e T3 que se CRUZAM: numas medidas o T1 é mais alto, noutras o T3 (como na referência simulada local, em
     * que o T3 do ponto A vale mais no RMS e menos na velocidade). Cada etapa tem σ próprio.
     */
    static ReferenciaAtiva cruzada() {
        List<CelulaGravada> celulas = new ArrayList<>();
        String[] codigos = {"A", "B", "C"};
        double[] rms = {0.036, 0.072, 0.040};
        for (int i = 0; i < 3; i++) {
            long id = PONTOS.get(codigos[i]);
            for (String etapa : List.of("T1", "T3")) {
                boolean t1 = etapa.equals("T1");
                int k = 0;
                for (Medida m : Medida.values()) {
                    double base = base(m, rms[i]);
                    // medidas pares: T3 acima; ímpares: T1 acima
                    boolean acima = (k++ % 2 == 0) != t1;
                    double mediana = base * (acima ? 1.10 : 0.92);
                    double sigma = base * (t1 ? 0.07 : 0.05);
                    celulas.add(new CelulaGravada(0, id, codigos[i], m, MARCHA, etapa, false, null, null, 30, 0,
                            mediana, sigma, mediana * 1.2, null, sigma, true, CALIBRACAO, "simulado"));
                }
            }
        }
        return new ReferenciaAtiva(1, 1, celulas);
    }

    private static double base(Medida m, double rms) {
        return switch (m) {
            case RMS_G -> rms;
            case PICO_G -> rms * 3.2;
            case CURTOSE -> 2.6;
            case O1X -> rms * 0.7;
            case O2X -> rms * 0.2;
            case O3X -> rms * 0.1;
            case VEL_RMS_MM_S -> rms * 12;
        };
    }

    /** {@code sigmaFracao}: σ efetivo como fração da mediana. */
    static ReferenciaAtiva com(double[] t1, double[] t3, double sigmaFracao, boolean comVelocidade) {
        List<CelulaGravada> celulas = new ArrayList<>();
        String[] codigos = {"A", "B", "C"};
        for (int i = 0; i < 3; i++) {
            celulas.addAll(etapa(codigos[i], PONTOS.get(codigos[i]), "T1", t1[i], sigmaFracao, comVelocidade));
            celulas.addAll(etapa(codigos[i], PONTOS.get(codigos[i]), "T3", t3[i], sigmaFracao, comVelocidade));
        }
        return new ReferenciaAtiva(1, 1, celulas);
    }

    static List<CelulaGravada> etapa(String codigo, long pontoId, String etapa, double rms, double sigmaFracao,
                                     boolean comVelocidade) {
        List<CelulaGravada> lista = new ArrayList<>();
        for (Medida m : Medida.values()) {
            if (m == Medida.VEL_RMS_MM_S && !comVelocidade) {
                continue;
            }
            double base = switch (m) {
                case RMS_G -> rms;
                case PICO_G -> rms * 3.2;
                case CURTOSE -> 2.6;
                case O1X -> rms * 0.7;
                case O2X -> rms * 0.2;
                case O3X -> rms * 0.1;
                case VEL_RMS_MM_S -> rms * 12;
            };
            double sigma = base * sigmaFracao;
            lista.add(new CelulaGravada(0, pontoId, codigo, m, MARCHA, etapa, false, null, null, 30, 0, base, sigma,
                    base * 1.2, null, sigma, true, CALIBRACAO, "simulado"));
        }
        return lista;
    }
}
