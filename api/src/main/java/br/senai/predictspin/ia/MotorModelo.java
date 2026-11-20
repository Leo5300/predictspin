package br.senai.predictspin.ia;

/**
 * Quem executa os modelos de uma versão. Recebe o vetor já na ordem das características do modelo (float, como no
 * treino) e devolve o escore de anomalia (= -score_samples do scikit-learn) e as probabilidades das classes.
 */
public interface MotorModelo extends AutoCloseable {

    /** @param probabilidades nulo quando a versão não tem classificador */
    record Saida(double escore, double[] probabilidades) {
    }

    Saida avaliar(float[] x);

    /** "onnx" (ONNX Runtime) ou "java" (árvores avaliadas em Java puro). */
    String caminho();

    @Override
    void close();
}
