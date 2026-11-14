package br.senai.predictspin.config;

import java.lang.annotation.Annotation;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.PropertyCustomizer;
import org.springdoc.core.properties.SpringDocConfigProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.Nullable;

import com.fasterxml.jackson.annotation.JsonInclude;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.comum.ErroResposta;
import br.senai.predictspin.eventos.dto.EnsaioEvento;
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
 * mesmo ObjectMapper da aplicação (snake_case, enums pelo valor), dizem quais propriedades sempre vêm
 * e quais podem ser nulas, e toda resposta de erro aponta para {@link ErroResposta}. O teste de
 * contrato confere um lado contra o outro.
 */
@Configuration
public class OpenApiConfig {

    public static final String ESQUEMA_JWT = "jwt";
    public static final String ESQUEMA_DISPOSITIVO_ID = "dispositivoId";
    public static final String ESQUEMA_DISPOSITIVO_CHAVE = "dispositivoChave";

    private static final String ROTA_LOGIN = "/api/v1/auth/login";
    private static final String ROTA_INGESTAO = "/api/v1/telemetria";

    /** Esquemas que não são corpo de nenhuma rota JSON, mas que o cliente precisa conhecer. */
    private static final List<Class<?>> ESQUEMAS_EXTRAS = List.of(ErroResposta.class, EnsaioEvento.class);

    /** Marca interna de propriedade que pode não vir no JSON; é retirada antes de o documento sair. */
    private static final String EXTENSAO_OPCIONAL = "x-opcional";

    /** Marca interna de propriedade que pode vir nula; vira o tipo "null" antes de o documento sair. */
    private static final String EXTENSAO_NULO = "x-nulo";

    /** ErroResposta omite o que está vazio (JsonInclude na classe): só "campos" fica vazio na prática. */
    private static final Map<String, Set<String>> OMITIDAS_QUANDO_VAZIAS = Map.of("ErroResposta", Set.of("campos"));

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
                                consultas, eventos ao vivo, ensaios de coleta rotulada e exportação para treino.

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

    /**
     * Anota em cada propriedade o que o JSON pode fazer com ela: vir nula (componente marcado com
     * {@code @Nullable}) ou não vir (componente com {@code @JsonInclude} que omite nulo ou vazio). As
     * marcas são aplicadas e retiradas em {@link #marcarObrigatorias}, com o documento já montado.
     */
    @Bean
    PropertyCustomizer nulosEOpcionais() {
        return (propriedade, tipo) -> {
            Annotation[] anotacoes = tipo.getCtxAnnotations();
            if (anotacoes == null) {
                return propriedade;
            }
            for (Annotation anotacao : anotacoes) {
                if (anotacao instanceof Nullable) {
                    propriedade.addExtension(EXTENSAO_NULO, true);
                } else if (anotacao instanceof JsonInclude inclusao && inclusao.value() != JsonInclude.Include.ALWAYS) {
                    propriedade.addExtension(EXTENSAO_OPCIONAL, true);
                }
            }
            return propriedade;
        };
    }

    /** Propriedades que são outro esquema ($ref) e podem vir nulas, por esquema. */
    private static final Map<String, Set<String>> OBJETOS_NULAVEIS = Map.of(
            "EnsaioResposta", Set.of("material_item", "ferramenta_item"));

    /** No documento 3.1, "pode ser nulo" é o tipo "null" ao lado do tipo do valor. */
    private static void permitirNulo(Schema<?> propriedade) {
        Set<String> tipos = new LinkedHashSet<>();
        if (propriedade.getTypes() != null) {
            tipos.addAll(propriedade.getTypes());
        } else if (propriedade.getType() != null) {
            tipos.add(propriedade.getType());
        }
        tipos.add("null");
        propriedade.setTypes(tipos);
    }

    /**
     * Nos esquemas de resposta toda propriedade é obrigatória (a chave sempre vem no JSON), menos as
     * que a API omite de propósito. Os esquemas de requisição ficam como a validação os descreve.
     */
    private static void marcarObrigatorias(String nome, Schema<?> esquema) {
        if (nome.endsWith("Requisicao") || esquema.getProperties() == null) {
            return;
        }
        Set<String> omitidasNoEsquema = OMITIDAS_QUANDO_VAZIAS.getOrDefault(nome, Set.of());
        List<String> obrigatorias = new ArrayList<>();
        esquema.getProperties().forEach((propriedade, definicao) -> {
            Map<String, Object> extensoes = definicao.getExtensions();
            boolean opcional = extensoes != null && extensoes.remove(EXTENSAO_OPCIONAL) != null;
            if (extensoes != null && extensoes.remove(EXTENSAO_NULO) != null) {
                permitirNulo(definicao);
            }
            if (definicao.get$ref() != null
                    && OBJETOS_NULAVEIS.getOrDefault(nome, Set.of()).contains(propriedade)) {
                // objeto que pode ser nulo: no 3.1, "o esquema OU null" (o $ref não aceita irmãos, e a
                // anotação @Nullable num campo que é $ref vai parar no componente, não na propriedade)
                esquema.getProperties().put(propriedade, new Schema<>().anyOf(List.of(
                        new Schema<>().$ref(definicao.get$ref()), new Schema<>().types(Set.of("null")))));
            }
            if (extensoes != null && extensoes.isEmpty()) {
                definicao.setExtensions(null);
            }
            if (!opcional && !omitidasNoEsquema.contains(propriedade)) {
                obrigatorias.add(propriedade);
            }
        });
        esquema.setRequired(obrigatorias);
    }

    /** Registra os esquemas extras e liga toda resposta 4xx/5xx das rotas da API ao ErroResposta. */
    @Bean
    OpenApiCustomizer respostasDeErro(SpringDocConfigProperties propriedades) {
        return openApi -> {
            // O conversor tem de ser o mesmo que o springdoc usa nas rotas (o da versão 3.1 do documento, onde o
            // ModelResolver acima está registrado); esquema que já existe nunca é substituído.
            ModelConverters conversores = ModelConverters.getInstance(propriedades.isOpenapi31());
            Map<String, Schema> existentes = openApi.getComponents().getSchemas();
            ESQUEMAS_EXTRAS.forEach(tipo -> conversores.readAll(tipo).forEach((nome, esquema) -> {
                if (existentes == null || !existentes.containsKey(nome)) {
                    openApi.getComponents().addSchemas(nome, esquema);
                }
            }));
            if (openApi.getComponents().getSchemas() != null) {
                openApi.getComponents().getSchemas().forEach(OpenApiConfig::marcarObrigatorias);
            }
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
