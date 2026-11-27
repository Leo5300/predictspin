package br.senai.predictspin.demo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.TreeMap;

import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.referencia.Medida;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaRepository.CelulaGravada;
import br.senai.predictspin.telemetria.EixoSensor;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao.MedidaPonto;

/**
 * Monta uma janela SIMULADA para um nível da barra de demonstração, sem banco.
 * <p>
 * O formato é o do simulador (analise/simulador.py): mesmos campos, firmware_versao "simulado", eixo z, rotação
 * "medida" um pouco abaixo da nominal (escorregamento de 0,4% com ruído de 0,3%), 1600 amostras por segundo e
 * canais lentos. Os valores das medidas NÃO são fixos: cada um sai da referência ativa do ponto na marcha da
 * demonstração, {@code mediana + z × σ efetivo}, com o z sorteado na faixa do nível. As faixas vêm dos limites
 * reais ({@link PropriedadesAlarme}), nada escrito à mão: com z de ATENÇÃO 3 e de ALARME 5,
 * <ul>
 *   <li>NORMAL: A, B e C com z de −z_atenção/3 a +z_atenção/2 (−1 a +1,5);</li>
 *   <li>ATENÇÃO: A de 25% a 75% do caminho entre os dois limites (3,5 a 4,5); B perto de 0,5 × z_atenção (1,5);
 *       C normal;</li>
 *   <li>ALARME: A de 0,5 a 1,5 vezes a distância entre os limites acima do z de alarme (6 a 8); B em ATENÇÃO
 *       (3,5 a 4); C normal.</li>
 * </ul>
 * Sem ensaio, o avaliador compara a janela com o T1 (em vazio) e com o T3 genérico da marcha e fica com a de
 * menor pior z. Por isso todas as medidas de um ponto saem da etapa em que o RMS fica mais alto
 * ({@link #etapaDominante}): contra ela o pior z é o sorteado, e contra a outra nunca é menor. O nível pedido vale
 * mesmo que o T1 e o T3 tenham valores bem diferentes ou se cruzem de uma medida para outra.
 * No ponto elevado, as outras medidas acompanham o RMS com frações dele (pico, 1X, 2X, 3X, velocidade e curtose),
 * como nos modos atenção e severo do simulador, e o RMS continua sendo a medida dominante.
 */
public final class GeradorDeJanela {

    static final List<String> ETAPAS = List.of("T1", "T3");
    static final String FIRMWARE = "simulado";
    private static final int TAXA_HZ = 1600;
    private static final double DURACAO_S = 5;
    private static final double FUNDO_ESCALA_G = 16.0;

    /** Medidas obrigatórias do contrato; a velocidade é opcional (só vai se a referência tiver). */
    private static final List<Medida> OBRIGATORIAS = List.of(Medida.RMS_G, Medida.PICO_G, Medida.CURTOSE,
            Medida.O1X, Medida.O2X, Medida.O3X);

    /** Fração do z do RMS que cada medida acompanha num ponto elevado. */
    private static final Map<Medida, Double> FRACAO_DO_RMS = new EnumMap<>(Map.of(
            Medida.RMS_G, 1.0, Medida.PICO_G, 0.9, Medida.CURTOSE, 0.5, Medida.O1X, 0.95, Medida.O2X, 0.8,
            Medida.O3X, 0.7, Medida.VEL_RMS_MM_S, 0.9));

    private GeradorDeJanela() {
    }

    /** Faixa de z do RMS de um ponto; {@code acompanhado} = as outras medidas seguem o RMS. */
    public record Faixa(double min, double max, boolean acompanhado) {
    }

    /** Faixas de z do RMS de A, B e C para o nível, a partir dos limites de alarme em uso. */
    public static Map<String, Faixa> faixas(NivelDemo nivel, PropriedadesAlarme p) {
        double zAtencao = p.zAtencao();
        double zAlarme = p.zAlarme();
        double vao = zAlarme - zAtencao;
        Faixa normal = new Faixa(-zAtencao / 3, zAtencao / 2, false);
        Map<String, Faixa> faixas = new LinkedHashMap<>();
        switch (nivel) {
            case ATENCAO -> {
                faixas.put("A", new Faixa(zAtencao + 0.25 * vao, zAtencao + 0.75 * vao, true));
                faixas.put("B", new Faixa(0.4 * zAtencao, 0.6 * zAtencao, true));
                faixas.put("C", normal);
            }
            case ALARME -> {
                faixas.put("A", new Faixa(zAlarme + 0.5 * vao, zAlarme + 1.5 * vao, true));
                faixas.put("B", new Faixa(zAtencao + 0.25 * vao, zAtencao + 0.5 * vao, true));
                faixas.put("C", normal);
            }
            default -> {
                faixas.put("A", normal);
                faixas.put("B", normal);
                faixas.put("C", normal);
            }
        }
        return faixas;
    }

    /**
     * O que falta na referência para gerar a demonstração: uma frase por ponto e etapa sem célula suficiente
     * nas medidas obrigatórias. Lista vazia = pronta. A velocidade não é exigida.
     */
    public static List<String> faltas(ReferenciaAtiva ref, Map<String, Long> pontos, int marcha) {
        List<String> faltas = new ArrayList<>();
        for (Map.Entry<String, Long> ponto : new TreeMap<>(pontos).entrySet()) {
            for (String etapa : ETAPAS) {
                List<String> sem = new ArrayList<>();
                for (Medida m : OBRIGATORIAS) {
                    if (ref.celula(ponto.getValue(), m, marcha, etapa).isEmpty()) {
                        sem.add(m.rotulo());
                    }
                }
                if (!sem.isEmpty()) {
                    faltas.add("ponto " + ponto.getKey() + " no " + etapa + " (" + String.join(", ", sem) + ")");
                }
            }
        }
        return faltas;
    }

    /**
     * Uma janela do nível. {@code z} (se não for nulo) recebe o z sorteado de cada medida de cada ponto, para os
     * testes conferirem. A referência precisa estar completa ({@link #faltas} vazia).
     */
    public static TelemetriaRequisicao montar(String dispositivo, Instant medidoEm, NivelDemo nivel,
                                              ReferenciaAtiva ref, Map<String, Long> pontos, int marcha,
                                              int rotacaoAlvoRpm, PropriedadesAlarme limites, Random rng,
                                              Map<String, Map<Medida, Double>> z) {
        Map<String, Faixa> faixas = faixas(nivel, limites);
        Faixa normal = faixas(NivelDemo.NORMAL, limites).get("A");

        Map<String, MedidaPonto> medidas = new LinkedHashMap<>();
        Map<String, String> calibracao = new LinkedHashMap<>();
        Map<String, EixoSensor> eixos = new LinkedHashMap<>();
        for (Map.Entry<String, Long> ponto : new TreeMap<>(pontos).entrySet()) {
            String codigo = ponto.getKey();
            long pontoId = ponto.getValue();
            Map<Medida, Double> zs = sortear(faixas.getOrDefault(codigo, normal), rng);
            if (z != null) {
                z.put(codigo, zs);
            }
            medidas.put(codigo, medidaDoPonto(ref, pontoId, marcha, zs));
            String cal = ref.calibracao(pontoId);
            if (cal != null) {
                calibracao.put(codigo, cal);
            }
            eixos.put(codigo, EixoSensor.Z);
        }

        double escorregamento = 0.004;
        double rotacao = rotacaoAlvoRpm * (1 - escorregamento) * Math.max(0.9, 1 + 0.003 * rng.nextGaussian());
        rotacao = Math.round(rotacao * 10) / 10.0;
        boolean saturou = medidas.values().stream().anyMatch(m -> m.picoG() >= FUNDO_ESCALA_G);
        int esperadas = (int) Math.round(TAXA_HZ * DURACAO_S);
        return new TelemetriaRequisicao(dispositivo, medidoEm, rotacao, saturou, medidas,
                canais(nivel, rotacao, rng), null, esperadas - rng.nextInt(3), esperadas, FIRMWARE,
                calibracao.isEmpty() ? null : calibracao, eixos);
    }

    /** z de cada medida de um ponto: elevado = o RMS na faixa e as outras acompanhando; normal = cada uma na faixa. */
    static Map<Medida, Double> sortear(Faixa faixa, Random rng) {
        Map<Medida, Double> zs = new EnumMap<>(Medida.class);
        if (!faixa.acompanhado()) {
            for (Medida m : Medida.values()) {
                zs.put(m, entre(faixa.min(), faixa.max(), rng));
            }
            return zs;
        }
        double zRms = entre(faixa.min(), faixa.max(), rng);
        for (Medida m : Medida.values()) {
            if (m == Medida.RMS_G) {
                zs.put(m, zRms);
            } else {
                // um pouco abaixo do RMS, para o RMS continuar sendo a medida dominante
                double z = zRms * FRACAO_DO_RMS.get(m) + 0.1 * rng.nextGaussian();
                zs.put(m, Math.min(z, zRms - 0.05));
            }
        }
        return zs;
    }

    private static double entre(double min, double max, Random rng) {
        return min + (max - min) * rng.nextDouble();
    }

    private static MedidaPonto medidaDoPonto(ReferenciaAtiva ref, long pontoId, int marcha, Map<Medida, Double> zs) {
        String etapa = etapaDominante(ref, pontoId, marcha, zs.get(Medida.RMS_G));
        double rms = valor(ref, pontoId, Medida.RMS_G, marcha, etapa, zs);
        double pico = valor(ref, pontoId, Medida.PICO_G, marcha, etapa, zs);
        double curtose = valor(ref, pontoId, Medida.CURTOSE, marcha, etapa, zs);
        double o1x = valor(ref, pontoId, Medida.O1X, marcha, etapa, zs);
        double o2x = valor(ref, pontoId, Medida.O2X, marcha, etapa, zs);
        double o3x = valor(ref, pontoId, Medida.O3X, marcha, etapa, zs);
        Double vel = valorOuNulo(ref, pontoId, Medida.VEL_RMS_MM_S, marcha, etapa, zs.get(Medida.VEL_RMS_MM_S));
        return new MedidaPonto(arredondar(rms, 5), arredondar(Math.min(pico, FUNDO_ESCALA_G - 0.001), 5),
                arredondar(Math.max(curtose, 1.0), 4), arredondar(o1x, 5), arredondar(o2x, 5), arredondar(o3x, 5),
                vel == null ? null : arredondar(vel, 4), null, null);
    }

    /**
     * A etapa (T1 ou T3) em que o RMS da janela fica MAIS ALTO para o z sorteado. Todas as medidas do ponto saem
     * desta mesma etapa: contra ela o pior z é exatamente o sorteado, e contra a outra o z do RMS nunca fica
     * abaixo dele. Assim o avaliador, que fica com a etapa de menor pior z, sempre lê o nível pedido (misturar
     * etapas medida a medida deixava o z do pior caso até 0,9 acima do sorteado quando T1 e T3 se cruzam).
     */
    static String etapaDominante(ReferenciaAtiva ref, long pontoId, int marcha, double zRms) {
        String melhor = null;
        double maior = Double.NEGATIVE_INFINITY;
        for (String etapa : ETAPAS) {
            Optional<CelulaGravada> celula = ref.celula(pontoId, Medida.RMS_G, marcha, etapa);
            if (celula.isPresent()) {
                double v = celula.get().mediana() + zRms * celula.get().sigmaEfetivo();
                if (v > maior) {
                    maior = v;
                    melhor = etapa;
                }
            }
        }
        if (melhor == null) {
            throw new IllegalStateException("Referência sem o RMS do ponto " + pontoId + " na marcha " + marcha);
        }
        return melhor;
    }

    private static double valor(ReferenciaAtiva ref, long pontoId, Medida medida, int marcha, String etapa,
                                Map<Medida, Double> zs) {
        Double v = valorOuNulo(ref, pontoId, medida, marcha, etapa, zs.get(medida));
        if (v == null) {
            throw new IllegalStateException("Referência sem a medida " + medida.valor() + " no ponto " + pontoId);
        }
        return v;
    }

    /**
     * {@code mediana + z × σ efetivo} da célula da etapa. Nunca abaixo de 60% do típico (z muito negativo viraria
     * "sinal sumido") e nunca negativo. Nulo quando a etapa não tem a célula (velocidade é opcional).
     */
    static Double valorOuNulo(ReferenciaAtiva ref, long pontoId, Medida medida, int marcha, String etapa, double z) {
        Optional<CelulaGravada> celula = ref.celula(pontoId, medida, marcha, etapa);
        if (celula.isEmpty()) {
            return null;
        }
        CelulaGravada c = celula.get();
        double v = c.mediana() + z * c.sigmaEfetivo();
        return Math.max(Math.max(v, 0.6 * c.mediana()), 0.0);
    }

    private static double arredondar(double valor, int casas) {
        double f = Math.pow(10, casas);
        return Math.round(valor * f) / f;
    }

    /** Canais lentos como os do simulador (girando, sem corte); sobem um pouco com o nível. */
    private static Map<String, Double> canais(NivelDemo nivel, double rotacaoRpm, Random rng) {
        double r = rotacaoRpm / 1000.0;
        double fator = switch (nivel) {
            case ATENCAO -> 1.1;
            case ALARME -> 1.25;
            default -> 1.0;
        };
        double ambiente = 24.0 + 0.3 * rng.nextGaussian();
        Map<String, Double> canais = new LinkedHashMap<>();
        canais.put("temp_cabecote_c", arredondar(ambiente + (6.0 + 14.0 * r) * fator + 0.4 * rng.nextGaussian(), 2));
        canais.put("temp_ferramenta_c", arredondar(ambiente + 0.8 * rng.nextGaussian(), 2));
        canais.put("amb_temp_c", arredondar(ambiente, 2));
        canais.put("amb_umid_pct", arredondar(Math.min(100.0, Math.max(0.0, 55.0 + 1.5 * rng.nextGaussian())), 1));
        canais.put("corrente_a", arredondar((2.2 + 1.1 * r) * fator * Math.max(0.2, 1 + 0.03 * rng.nextGaussian()), 3));
        return canais;
    }
}
