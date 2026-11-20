package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Plano B (caminho de produção): as árvores avaliadas em Java puro dão as mesmas saídas que o onnxruntime do
 * Python (gravadas em modelo-fixture/paridade.json) nas mesmas 500 janelas SINTÉTICAS, com tolerância de 1e-5.
 */
class MotorArvoresTest {

    @Test
    void mesmasSaidasQueOOnnxruntimeDoPythonEm500Janelas() throws IOException {
        ObjectMapper json = new ObjectMapper();
        JsonNode meta = json.readTree(MotorOnnxTest.ler("metadados.json"));
        JsonNode paridade = json.readTree(MotorOnnxTest.ler("paridade.json"));
        int n = meta.get("caracteristicas").size();
        double maiorDiferenca = 0;
        try (MotorModelo motor = new MotorArvores(MotorOnnxTest.ler("arvores.json"), n, meta.get("classes").size())) {
            assertThat(motor.caminho()).isEqualTo("java");
            for (int i = 0; i < 500; i++) {
                JsonNode e = paridade.get("entradas").get(i);
                float[] x = new float[n];
                for (int k = 0; k < n; k++) {
                    x[k] = (float) e.get(k).asDouble();
                }
                MotorModelo.Saida s = motor.avaliar(x);
                maiorDiferenca = Math.max(maiorDiferenca, Math.abs(s.escore() - paridade.get("escore").get(i).asDouble()));
                JsonNode p = paridade.get("probabilidades").get(i);
                for (int c = 0; c < p.size(); c++) {
                    maiorDiferenca = Math.max(maiorDiferenca, Math.abs(s.probabilidades()[c] - p.get(c).asDouble()));
                }
            }
        }
        assertThat(maiorDiferenca).isLessThan(1e-5);
    }

    @Test
    void arvoresInvalidasSaoRecusadas() throws IOException {
        byte[] arvores = MotorOnnxTest.ler("arvores.json");
        assertThatThrownBy(() -> new MotorArvores("{".getBytes(StandardCharsets.UTF_8), 25, 5))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("ilegíveis");
        assertThatThrownBy(() -> new MotorArvores("{}".getBytes(StandardCharsets.UTF_8), 25, 5))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Isolation Forest");
        assertThatThrownBy(() -> new MotorArvores(arvores, 25, 3)).hasMessageContaining("classes");
        assertThatThrownBy(() -> new MotorArvores(arvores, 4, 5)).hasMessageContaining("característica");
        try (MotorModelo m = new MotorArvores(arvores, 25, 5)) {
            assertThatThrownBy(() -> m.avaliar(new float[3])).isInstanceOf(IllegalArgumentException.class);
        }
        // só o Isolation Forest (sem classificador)
        JsonNode raiz = new ObjectMapper().readTree(arvores);
        ((com.fasterxml.jackson.databind.node.ObjectNode) raiz).remove("random_forest");
        try (MotorModelo so = new MotorArvores(new ObjectMapper().writeValueAsBytes(raiz), 25, 0)) {
            assertThat(so.avaliar(new float[25]).probabilidades()).isNull();
        }
    }
}
