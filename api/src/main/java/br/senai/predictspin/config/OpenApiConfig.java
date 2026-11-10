package br.senai.predictspin.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** Documentação em /swagger-ui. Usuário: JWT Bearer. Dispositivo: dois cabeçalhos. */
@Configuration
public class OpenApiConfig {

    public static final String ESQUEMA_JWT = "jwt";
    public static final String ESQUEMA_DISPOSITIVO_ID = "dispositivoId";
    public static final String ESQUEMA_DISPOSITIVO_CHAVE = "dispositivoChave";

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
}
