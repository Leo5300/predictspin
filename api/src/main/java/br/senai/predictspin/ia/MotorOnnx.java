package br.senai.predictspin.ia;

import java.nio.FloatBuffer;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * Os modelos de uma versão no ONNX Runtime, dentro da API (nada dorme no caminho da opinião). É o caminho de
 * produção (memória medida em docs/ia.md); as árvores em Java puro ficaram só nos testes, como plano B. Isolation Forest:
 * saída "scores" (decision_function do scikit-learn); o escore de anomalia é -(scores + offset). Random Forest:
 * saída "probabilities", na ordem das classes do treino. As sessões são seguras para uso concorrente.
 */
public final class MotorOnnx implements MotorModelo {

    private static final OrtEnvironment AMBIENTE = OrtEnvironment.getEnvironment();

    private final OrtSession anomalia;
    private final OrtSession classe;
    private final double offset;
    private final int n;

    public MotorOnnx(byte[] onnxAnomalia, byte[] onnxClasse, double offset, int caracteristicas) {
        this.offset = offset;
        this.n = caracteristicas;
        try (OrtSession.SessionOptions opcoes = new OrtSession.SessionOptions()) {
            // instância pequena: uma thread por sessão, sem pré-alocar memória por thread
            opcoes.setIntraOpNumThreads(1);
            opcoes.setInterOpNumThreads(1);
            opcoes.setMemoryPatternOptimization(false);
            opcoes.setCPUArenaAllocator(false);
            this.anomalia = AMBIENTE.createSession(onnxAnomalia, opcoes);
            this.classe = onnxClasse == null ? null : AMBIENTE.createSession(onnxClasse, opcoes);
        } catch (OrtException e) {
            throw new IllegalArgumentException("modelo ONNX inválido: " + e.getMessage(), e);
        }
    }

    @Override
    public Saida avaliar(float[] x) {
        if (x.length != n) {
            throw new IllegalArgumentException("vetor com " + x.length + " características; o modelo usa " + n);
        }
        try (OnnxTensor entrada = OnnxTensor.createTensor(AMBIENTE, FloatBuffer.wrap(x), new long[] {1, n})) {
            double escore;
            try (OrtSession.Result r = anomalia.run(Map.of(anomalia.getInputNames().iterator().next(), entrada),
                    java.util.Set.of("scores"))) {
                float[][] scores = (float[][]) r.get(0).getValue();
                escore = -(scores[0][0] + offset);
            }
            double[] probabilidades = null;
            if (classe != null) {
                try (OrtSession.Result r = classe.run(Map.of(classe.getInputNames().iterator().next(), entrada),
                        java.util.Set.of("probabilities"))) {
                    float[][] p = (float[][]) r.get(0).getValue();
                    probabilidades = new double[p[0].length];
                    for (int i = 0; i < p[0].length; i++) {
                        probabilidades[i] = p[0][i];
                    }
                }
            }
            return new Saida(escore, probabilidades);
        } catch (OrtException e) {
            throw new IllegalStateException("falha no ONNX Runtime: " + e.getMessage(), e);
        }
    }

    @Override
    public String caminho() {
        return "onnx";
    }

    @Override
    public void close() {
        try {
            anomalia.close();
            if (classe != null) {
                classe.close();
            }
        } catch (OrtException e) {
            throw new IllegalStateException(e);
        }
    }
}
