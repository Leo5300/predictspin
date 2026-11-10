package br.senai.predictspin.seguranca;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.comum.TratadorGlobalErros;

/** Respostas 401 e 403 geradas pelos filtros de segurança, no mesmo formato do restante da API. */
@Component
public class RespostaErroSeguranca implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper json;

    public RespostaErroSeguranca(ObjectMapper json) {
        this.json = json;
    }

    @Override
    public void commence(HttpServletRequest req, HttpServletResponse resp, AuthenticationException e)
            throws IOException {
        String mensagem = req.getRequestURI().startsWith("/api/v1/telemetria")
                ? "Credencial de dispositivo ausente ou inválida (X-Dispositivo-Id e X-Dispositivo-Chave)"
                : "Autenticação necessária: envie um token válido em Authorization: Bearer";
        resp.setHeader("WWW-Authenticate", "Bearer");
        escrever(req, resp, HttpStatus.UNAUTHORIZED, mensagem);
    }

    @Override
    public void handle(HttpServletRequest req, HttpServletResponse resp, AccessDeniedException e) throws IOException {
        escrever(req, resp, HttpStatus.FORBIDDEN, "Acesso negado para o seu papel");
    }

    private void escrever(HttpServletRequest req, HttpServletResponse resp, HttpStatus status, String mensagem)
            throws IOException {
        resp.setStatus(status.value());
        resp.setContentType(MediaType.APPLICATION_JSON_VALUE);
        resp.setCharacterEncoding("UTF-8");
        json.writeValue(resp.getOutputStream(), TratadorGlobalErros.corpo(status, mensagem, req, List.of()));
    }
}
