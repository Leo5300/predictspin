package br.senai.predictspin.seguranca;

import java.nio.charset.StandardCharsets;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import br.senai.predictspin.maquina.DispositivoService;

/**
 * Duas cadeias de segurança independentes:
 * <ol>
 *   <li>POST /api/v1/telemetria: só dispositivo, autenticado por cabeçalho;</li>
 *   <li>todo o resto: usuário com JWT stateless, autorização por papel.</li>
 * </ol>
 */
@Configuration
public class SegurancaConfig {

    public static final String EMISSOR_JWT = "predictspin";
    public static final String CLAIM_PAPEL = "papel";
    private static final int TAMANHO_MINIMO_SEGREDO = 32;

    @Bean
    @Order(1)
    SecurityFilterChain cadeiaDispositivo(HttpSecurity http, DispositivoService dispositivos,
                                          RespostaErroSeguranca erros) throws Exception {
        http.securityMatcher("/api/v1/telemetria", "/api/v1/telemetria/**")
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(new DispositivoAutenticacaoFiltro(dispositivos), AnonymousAuthenticationFilter.class)
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.POST, "/api/v1/telemetria").hasRole("DISPOSITIVO")
                        .anyRequest().denyAll())
                .exceptionHandling(e -> e.authenticationEntryPoint(erros).accessDeniedHandler(erros))
                .headers(h -> h.referrerPolicy(r -> r.policy(ReferrerPolicy.NO_REFERRER)));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain cadeiaUsuario(HttpSecurity http, RespostaErroSeguranca erros,
                                      JwtAuthenticationConverter conversorJwt) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/swagger-ui", "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/v1/usuarios", "/api/v1/usuarios/**").hasRole("ADMIN")
                        .requestMatchers("/api/v1/ensaios/**", "/api/v1/maquinas/*/ensaios",
                                "/api/v1/maquinas/*/coleta/**").hasAnyRole("ADMIN", "TECNICO")
                        .requestMatchers("/api/v1/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o
                        .jwt(j -> j.jwtAuthenticationConverter(conversorJwt))
                        .authenticationEntryPoint(erros)
                        .accessDeniedHandler(erros))
                .exceptionHandling(e -> e.authenticationEntryPoint(erros).accessDeniedHandler(erros))
                .headers(h -> h.referrerPolicy(r -> r.policy(ReferrerPolicy.NO_REFERRER)));
        return http.build();
    }

    @Bean
    SecretKey chaveJwt(PropriedadesSeguranca propriedades) {
        String segredo = propriedades.jwt() == null ? null : propriedades.jwt().segredo();
        if (segredo == null || segredo.getBytes(StandardCharsets.UTF_8).length < TAMANHO_MINIMO_SEGREDO) {
            throw new IllegalStateException("JWT_SECRET ausente ou curto: defina no mínimo "
                    + TAMANHO_MINIMO_SEGREDO + " caracteres (ex.: openssl rand -base64 48)");
        }
        return new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey chaveJwt) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(chaveJwt));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey chaveJwt) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(chaveJwt).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(EMISSOR_JWT));
        return decoder;
    }

    @Bean
    JwtAuthenticationConverter conversorJwt() {
        JwtGrantedAuthoritiesConverter papeis = new JwtGrantedAuthoritiesConverter();
        papeis.setAuthoritiesClaimName(CLAIM_PAPEL);
        papeis.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter conversor = new JwtAuthenticationConverter();
        conversor.setJwtGrantedAuthoritiesConverter(papeis);
        return conversor;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(PropriedadesSeguranca propriedades) {
        CorsConfiguration cors = new CorsConfiguration();
        List<String> origens = propriedades.corsOrigens() == null ? List.of()
                : propriedades.corsOrigens().stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        cors.setAllowedOrigins(origens);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        cors.setExposedHeaders(List.of("Retry-After", "Content-Disposition"));
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource fonte = new UrlBasedCorsConfigurationSource();
        fonte.registerCorsConfiguration("/api/**", cors);
        return fonte;
    }
}
