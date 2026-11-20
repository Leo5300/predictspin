package br.senai.predictspin.ia;

import java.io.IOException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * PLANO B, só nos testes: os modelos de uma versão avaliados em Java puro, a partir das árvores exportadas pelo treino
 * (arvores.json). Não está no caminho do alarme: pela memória medida no cenário realista, ficou o ONNX Runtime
 * (docs/ia.md). Se um dia a memória apertar, este avaliador já tem a paridade conferida.
 * <ul>
 *   <li>Regra de cada nó, igual ao scikit-learn e ao ONNX: vai para a esquerda quando {@code (float) x <= limiar}.</li>
 *   <li>Isolation Forest: cada folha guarda profundidade + c(amostras da folha); escore de anomalia =
 *       2^(-média / c(max_samples)) (= -score_samples do scikit-learn).</li>
 *   <li>Random Forest: cada folha guarda as probabilidades das classes; a probabilidade é a média entre as árvores.</li>
 * </ul>
 * Paridade com o onnxruntime do Python conferida em teste (500 janelas, tolerância 1e-5).
 */
public final class MotorArvores implements MotorModelo {

    /** Uma árvore em vetores paralelos (folha: esquerda = -1). */
    private record Arvore(int[] atributo, double[] limiar, int[] esquerda, int[] direita, double[][] folha) {

        int folhaDe(float[] x) {
            int no = 0;
            while (esquerda[no] != -1) {
                no = x[atributo[no]] <= limiar[no] ? esquerda[no] : direita[no];
            }
            return no;
        }
    }

    private final Arvore[] isolation;
    private final double cMaxAmostras;
    private final Arvore[] floresta;
    private final int classes;
    private final int n;

    public MotorArvores(byte[] arvoresJson, int caracteristicas, int classesEsperadas) {
        this.n = caracteristicas;
        JsonNode raiz;
        try {
            raiz = new ObjectMapper().readTree(arvoresJson);
        } catch (IOException | RuntimeException e) {
            throw new IllegalArgumentException("árvores do modelo ilegíveis: " + e.getMessage(), e);
        }
        JsonNode iso = raiz == null ? null : raiz.get("isolation_forest");
        if (iso == null || !iso.has("arvores")) {
            throw new IllegalArgumentException("árvores do modelo sem o Isolation Forest");
        }
        this.isolation = ler(iso.get("arvores"), false);
        this.cMaxAmostras = iso.get("c_max_amostras").asDouble();
        JsonNode rf = raiz.get("random_forest");
        this.floresta = rf == null ? null : ler(rf.get("arvores"), true);
        this.classes = rf == null ? 0 : rf.get("classes").size();
        if (classes != classesEsperadas) {
            throw new IllegalArgumentException("árvores com " + classes + " classes; os metadados dizem "
                    + classesEsperadas);
        }
        for (Arvore a : todas()) {
            for (int f : a.atributo()) {
                if (f >= n) {
                    throw new IllegalArgumentException("árvore usa a característica " + f + "; o modelo tem " + n);
                }
            }
        }
    }

    private Arvore[] todas() {
        if (floresta == null) {
            return isolation;
        }
        Arvore[] t = new Arvore[isolation.length + floresta.length];
        System.arraycopy(isolation, 0, t, 0, isolation.length);
        System.arraycopy(floresta, 0, t, isolation.length, floresta.length);
        return t;
    }

    private static Arvore[] ler(JsonNode arvores, boolean probabilidades) {
        Arvore[] lidas = new Arvore[arvores.size()];
        for (int k = 0; k < lidas.length; k++) {
            JsonNode a = arvores.get(k);
            int nos = a.get("esquerda").size();
            int[] atributo = new int[nos];
            double[] limiar = new double[nos];
            int[] esquerda = new int[nos];
            int[] direita = new int[nos];
            double[][] folha = new double[nos][];
            for (int i = 0; i < nos; i++) {
                atributo[i] = a.get("atributo").get(i).asInt();
                limiar[i] = a.get("limiar").get(i).asDouble();
                esquerda[i] = a.get("esquerda").get(i).asInt();
                direita[i] = a.get("direita").get(i).asInt();
                if (esquerda[i] == -1) {
                    JsonNode f = a.get("folha").get(i);
                    if (probabilidades) {
                        folha[i] = new double[f.size()];
                        for (int c = 0; c < f.size(); c++) {
                            folha[i][c] = f.get(c).asDouble();
                        }
                    } else {
                        folha[i] = new double[] {f.asDouble()};
                    }
                }
            }
            lidas[k] = new Arvore(atributo, limiar, esquerda, direita, folha);
        }
        return lidas;
    }

    @Override
    public Saida avaliar(float[] x) {
        if (x.length != n) {
            throw new IllegalArgumentException("vetor com " + x.length + " características; o modelo usa " + n);
        }
        double soma = 0;
        for (Arvore a : isolation) {
            soma += a.folha()[a.folhaDe(x)][0];
        }
        double escore = Math.pow(2, -(soma / isolation.length) / cMaxAmostras);
        double[] p = null;
        if (floresta != null) {
            p = new double[classes];
            for (Arvore a : floresta) {
                double[] folha = a.folha()[a.folhaDe(x)];
                for (int c = 0; c < classes; c++) {
                    p[c] += folha[c];
                }
            }
            for (int c = 0; c < classes; c++) {
                p[c] /= floresta.length;
            }
        }
        return new Saida(escore, p);
    }

    @Override
    public String caminho() {
        return "java";
    }

    @Override
    public void close() {
        // nada nativo para liberar
    }
}
