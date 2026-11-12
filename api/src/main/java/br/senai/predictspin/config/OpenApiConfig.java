package br.senai.predictspin.config;

import java.util.List;
import java.util.Map;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.comum.ErroResposta;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.core.jackson.ModelResolver;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/**
 * Documentação em /swagger-ui e /v3/api-docs. Usuário: JWT Bearer. Dispositivo: dois cabeçalhos.
 * O documento tem de descrever o JSON que a API realmente devolve: os esquemas são gerados com o
 * mesmo ObjectMapper da aplicação (snake_case, enums pelo valor) e toda resposta de erro aponta
 * para {@link ErroResposta}. O teste de contrato confere um lado contra o outro.
 */
@Configuration
public class OpenApiConfig {

    public static final String ESQUEMA_JWT = "jwt";
    public static final String ESQUEMA_DISPOSITIVO_ID = "dispositivoId";
    public static final String ESQUEMA_DISPOSITIVO_CHAVE = "dispositivoChave";

    private static final String ROTA_LOGIN = "/api/v1/auth/login";
    private static final String ROTA_INGESTAO = "/api/v1/telemetria";

    /** Esquemas que não são corpo de nenhuma rota JSON, mas que o cliente precisa conhecer. */
    private static final List<Class<?>> ESQUEMAS_EXTRAS = List.of(ErroResposta.class);

    private static final Map<String, String> DESCRICAO_PADRAO = Map.of(
            "400", "Requisição inválida",
            "401", "Autenticação ausente ou inválida",
            "403", "Sem permissão para esta operação",
            "404", "Recurso não encontrado");

    @Bean
    OpenAPI openApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("PredictSpin API")
                        .version("v1")
                        .description("""
                                Monitoramento de vibração em máquinas rotativas: ingestão de telemetria do ESP32,
                                consultas, ensaios de coleta rotulada e exportação para treino.

                                Usuários entram em POST /api/v1/auth/login e usam o token em Authorization: Bearer.
                                Dispositivos enviam telemetria com os cabeçalhos X-Dispositivo-Id e X-Dispositivo-Chave.
                                Corpo e resposta em JSON com nomes em snake_case.
                                """))
                .components(new Components()
                        .addSecuritySchemes(ESQUEMA_JWT, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT"))
                        .addSecuritySchemes(ESQUEMA_DISPOSITIVO_ID, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER).name("X-Dispositivo-Id"))
                        .addSecuritySchemes(ESQUEMA_DISPOSITIVO_CHAVE, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER).name("X-Dispositivo-Chave")))
                .addSecurityItem(new SecurityRequirement().addList(ESQUEMA_JWT));
    }

    /**
     * Faz o springdoc ler os DTOs com as regras de serialização da aplicação. Sem isto ele usa um
     * ObjectMapper próprio e o documento sai em camelCase, diferente do JSON real. A cópia evita que
     * o springdoc registre módulos no ObjectMapper usado nas respostas.
     */
    @Bean
    ModelResolver modelResolver(ObjectMapper objectMapper) {
        return new ModelResolver(objectMapper.copy());
    }

    /** Registra os esquemas extras e liga toda resposta 4xx/5xx das rotas da API ao ErroResposta. */
    @Bean
    OpenApiCustomizer respostasDeErro() {
        return openApi -> {
            ESQUEMAS_EXTRAS.forEach(tipo -> ModelConverters.getInstance().readAll(tipo)
                    .forEach((nome, esquema) -> openApi.getComponents().addSchemas(nome, esquema)));
            if (openApi.getPaths() == null) {
                return;
            }
            openApi.getPaths().forEach((caminho, item) -> {
                if (!caminho.startsWith("/api/v1")) {
                    return;
                }
                item.readOperations().forEach(operacao -> completarErros(caminho, operacao));
            });
        };
    }

    private static void completarErros(String caminho, Operation operacao) {
        ApiResponses respostas = operacao.getResponses();
        if (respostas == null) {
            respostas = new ApiResponses();
            operacao.setResponses(respostas);
        }
        boolean temEntrada = operacao.getRequestBody() != null
                || (operacao.getParameters() != null && !operacao.getParameters().isEmpty());
        if (temEntrada) {
            adicionar(respostas, "400");
        }
        adicionar(respostas, "401");
        if (!ROTA_LOGIN.equals(caminho)) {
            adicionar(respostas, "403");
        }
        if (caminho.contains("{") && !ROTA_INGESTAO.equals(caminho)) {
            adicionar(respostas, "404");
        }
        respostas.forEach((codigo, resposta) -> {
            if (codigo.startsWith("4") || codigo.startsWith("5")) {
                resposta.setContent(conteudoDeErro());
            }
        });
    }

    private static void adicionar(ApiResponses respostas, String codigo) {
        if (!respostas.containsKey(codigo)) {
            respostas.addApiResponse(codigo, new ApiResponse().description(DESCRICAO_PADRAO.get(codigo)));
        }
    }

    private static Content conteudoDeErro() {
        return new Content().addMediaType(org.springframework.http.MediaType.APPLICATION_JSON_VALUE,
                new MediaType().schema(new Schema<>().$ref("#/components/schemas/ErroResposta")));
    }
}
