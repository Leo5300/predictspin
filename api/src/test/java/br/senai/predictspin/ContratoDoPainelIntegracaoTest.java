package br.senai.predictspin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * O painel gera o cliente da API a partir de painel/openapi.json, um arquivo versionado. Este teste
 * garante que ele não fica defasado: se uma rota ou um DTO mudar sem o arquivo ser exportado de
 * novo, o build da API quebra aqui (também na integração contínua).
 */
class ContratoDoPainelIntegracaoTest extends IntegracaoBase {

    private static final Path ARQUIVO_DO_PAINEL = Path.of("..", "painel", "openapi.json");

    @Test
    void arquivoVersionadoDoPainelConfereComODocumentoDaApi() throws Exception {
        assertThat(ARQUIVO_DO_PAINEL).as("contrato versionado do painel").exists();

        JsonNode atual = corpo(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()));
        // o endereço do servidor depende de onde a API é chamada e não faz parte do contrato
        ((ObjectNode) atual).remove("servers");
        JsonNode versionado = json.readTree(Files.readString(ARQUIVO_DO_PAINEL, StandardCharsets.UTF_8));

        // 1200.0 (Java) e 1200 (JavaScript) são o mesmo número: compara números pelo valor
        assertThat(versionado.equals(ComparadorDeNumeros.INSTANCIA, atual))
                .as("painel/openapi.json está defasado da API. Com a API local no ar, rode "
                        + "\"npm run api:gerar\" em painel/ e versione o resultado.")
                .isTrue();
    }

    /** Igualdade de nós JSON em que números valem pelo valor, não pela forma escrita. */
    private enum ComparadorDeNumeros implements Comparator<JsonNode> {
        INSTANCIA;

        @Override
        public int compare(JsonNode a, JsonNode b) {
            if (a.isNumber() && b.isNumber()) {
                return a.decimalValue().compareTo(b.decimalValue());
            }
            return a.equals(b) ? 0 : 1;
        }
    }
}
