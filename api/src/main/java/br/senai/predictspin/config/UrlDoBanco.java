package br.senai.predictspin.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Aceita o endereço do banco numa única variável, {@code DATABASE_URL}, no formato
 * {@code postgresql://usuario:senha@host:porta/banco}, que é como o Render entrega a conexão.
 * Quando ela existe, vale no lugar de DB_HOST, DB_PORT, DB_NAME, DB_USER e DB_PASSWORD.
 */
public class UrlDoBanco implements EnvironmentPostProcessor {

    static final String VARIAVEL = "DATABASE_URL";
    static final String FONTE = "urlDoBanco";
    private static final int PORTA_PADRAO = 5432;
    // A mensagem não repete o valor recebido: ele contém a senha
    private static final String INVALIDA = VARIAVEL
            + " inválida: use postgresql://usuario:senha@host:porta/banco";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment ambiente, SpringApplication aplicacao) {
        String url = ambiente.getProperty(VARIAVEL);
        if (url == null || url.isBlank()) {
            return;
        }
        ambiente.getPropertySources().addFirst(new MapPropertySource(FONTE, converter(url)));
    }

    static Map<String, Object> converter(String url) {
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(INVALIDA);
        }
        String esquema = uri.getScheme();
        String banco = uri.getRawPath();
        boolean esquemaAceito = "postgresql".equalsIgnoreCase(esquema) || "postgres".equalsIgnoreCase(esquema);
        if (!esquemaAceito || uri.getHost() == null || banco == null || banco.length() < 2) {
            throw new IllegalArgumentException(INVALIDA);
        }

        int porta = uri.getPort() == -1 ? PORTA_PADRAO : uri.getPort();
        String jdbc = "jdbc:postgresql://" + uri.getHost() + ":" + porta + banco;
        if (uri.getRawQuery() != null) {
            jdbc += "?" + uri.getRawQuery();
        }

        Map<String, Object> propriedades = new LinkedHashMap<>();
        propriedades.put("spring.datasource.url", jdbc);
        String credenciais = uri.getRawUserInfo();
        if (credenciais != null) {
            int separador = credenciais.indexOf(':');
            String usuario = separador < 0 ? credenciais : credenciais.substring(0, separador);
            propriedades.put("spring.datasource.username", decodificar(usuario));
            if (separador >= 0) {
                propriedades.put("spring.datasource.password", decodificar(credenciais.substring(separador + 1)));
            }
        }
        return propriedades;
    }

    private static String decodificar(String texto) {
        // URLDecoder trata "+" como espaço; em URL de conexão o "+" é literal
        return URLDecoder.decode(texto.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
