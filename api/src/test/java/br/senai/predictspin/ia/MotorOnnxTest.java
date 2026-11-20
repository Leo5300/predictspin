package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Paridade: o ONNX Runtime para Java dá as mesmas saídas que o onnxruntime do Python (gravadas pelo treino em
 * modelo-fixture/paridade.json) nas mesmas 500 janelas SINTÉTICAS, com tolerância de 1e-5.
 */
class MotorOnnxTest {

    static final Path PASTA = Path.of("src", "test", "resources", "modelo-fixture");

    static byte[] ler(String nome) throws IOException {
        return Files.readAllBytes(PASTA.resolve(nome));
    }

    @Test
    void mesmasSaidasQueOOnnxruntimeDoPythonEm500Janelas() throws IOException {
        ObjectMapper json = new ObjectMapper();
        JsonNode meta = json.readTree(ler("metadados.json"));
        JsonNode paridade = json.readTree(ler("paridade.json"));
        int n = meta.get("caracteristicas").size();
        assertThat(paridade.get("entradas")).hasSize(500);
        double maiorDiferenca = 0;
        try (MotorModelo motor = new MotorOnnx(ler("anomalia.onnx"), ler("classe.onnx"),
                meta.get("offset_anomalia").asDouble(), n)) {
            assertThat(motor.caminho()).isEqualTo("onnx");
            for (int i = 0; i < 500; i++) {
                JsonNode e = paridade.get("entradas").get(i);
                float[] x = new float[n];
                for (int k = 0; k < n; k++) {
                    x[k] = (float) e.get(k).asDouble();
                }
                MotorModelo.Saida s = motor.avaliar(x);
                maiorDiferenca = Math.max(maiorDiferenca, Math.abs(s.escore() - paridade.get("escore").get(i).asDouble()));
                JsonNode p = paridade.get("probabilidades").get(i);
                assertThat(s.probabilidades()).hasSize(p.size());
                for (int c = 0; c < p.size(); c++) {
                    maiorDiferenca = Math.max(maiorDiferenca, Math.abs(s.probabilidades()[c] - p.get(c).asDouble()));
                }
            }
        }
        assertThat(maiorDiferenca).isLessThan(1e-5);
    }

    @Test
    void soAnomaliaEErros() throws IOException {
        JsonNode meta = new ObjectMapper().readTree(ler("metadados.json"));
        int n = meta.get("caracteristicas").size();
        try (MotorModelo motor = new MotorOnnx(ler("anomalia.onnx"), null, meta.get("offset_anomalia").asDouble(), n)) {
            assertThat(motor.avaliar(new float[n]).probabilidades()).isNull();
            assertThatThrownBy(() -> motor.avaliar(new float[n - 1])).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> new MotorOnnx(new byte[] {1, 2, 3}, null, 0, n))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("ONNX inválido");
    }
}
