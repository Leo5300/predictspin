package br.senai.predictspin.comum;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.fasterxml.jackson.databind.JsonMappingException;

/**
 * Converte toda exceção em {@link ErroResposta}. Mensagens são escritas para o cliente; detalhes
 * internos (stack trace, SQL, nomes de classe) vão só para o log.
 */
@RestControllerAdvice
public class TratadorGlobalErros {

    private static final Logger log = LoggerFactory.getLogger(TratadorGlobalErros.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErroResposta> validacao(MethodArgumentNotValidException e, HttpServletRequest req) {
        List<ErroResposta.CampoInvalido> campos = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new ErroResposta.CampoInvalido(paraSnakeCase(f.getField()), mensagem(f)))
                .toList();
        return resposta(HttpStatus.BAD_REQUEST, "Dados inválidos", req, campos);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ErroResposta> validacaoParametros(HandlerMethodValidationException e, HttpServletRequest req) {
        List<ErroResposta.CampoInvalido> campos = e.getParameterValidationResults().stream()
                .flatMap(r -> r.getResolvableErrors().stream().map(erro -> new ErroResposta.CampoInvalido(
                        r.getMethodParameter().getParameterName(), erro.getDefaultMessage())))
                .toList();
        return resposta(HttpStatus.BAD_REQUEST, "Parâmetros inválidos", req, campos);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ErroResposta> restricao(ConstraintViolationException e, HttpServletRequest req) {
        List<ErroResposta.CampoInvalido> campos = e.getConstraintViolations().stream()
                .map(v -> new ErroResposta.CampoInvalido(paraSnakeCase(v.getPropertyPath().toString()), v.getMessage()))
                .toList();
        return resposta(HttpStatus.BAD_REQUEST, "Dados inválidos", req, campos);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErroResposta> corpoIlegivel(HttpMessageNotReadableException e, HttpServletRequest req) {
        String mensagem = "Corpo da requisição ausente ou com JSON mal formado";
        if (e.getCause() instanceof JsonMappingException jme && !jme.getPath().isEmpty()) {
            String campo = jme.getPath().stream()
                    .map(r -> r.getFieldName() != null ? r.getFieldName() : "[" + r.getIndex() + "]")
                    .collect(Collectors.joining("."));
            String detalhe = causaLegivel(jme);
            mensagem = "Valor inválido no campo '" + campo + "'" + (detalhe == null ? "" : ": " + detalhe);
        }
        return resposta(HttpStatus.BAD_REQUEST, mensagem, req, List.of());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ErroResposta> tipoParametro(MethodArgumentTypeMismatchException e, HttpServletRequest req) {
        String detalhe = causaLegivel(e);
        return resposta(HttpStatus.BAD_REQUEST, "Parâmetro '" + e.getName() + "' inválido"
                + (detalhe == null ? "" : ": " + detalhe), req, List.of());
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<ErroResposta> parametroAusente(MissingServletRequestParameterException e, HttpServletRequest req) {
        return resposta(HttpStatus.BAD_REQUEST, "Parâmetro obrigatório ausente: " + e.getParameterName(), req, List.of());
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    ResponseEntity<ErroResposta> cabecalhoAusente(MissingRequestHeaderException e, HttpServletRequest req) {
        return resposta(HttpStatus.BAD_REQUEST, "Cabeçalho obrigatório ausente: " + e.getHeaderName(), req, List.of());
    }

    @ExceptionHandler(RequisicaoInvalidaException.class)
    ResponseEntity<ErroResposta> requisicaoInvalida(RequisicaoInvalidaException e, HttpServletRequest req) {
        return resposta(HttpStatus.BAD_REQUEST, e.getMessage(), req, List.of());
    }

    @ExceptionHandler(CredenciaisInvalidasException.class)
    ResponseEntity<ErroResposta> credenciais(CredenciaisInvalidasException e, HttpServletRequest req) {
        return resposta(HttpStatus.UNAUTHORIZED, e.getMessage(), req, List.of());
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ErroResposta> autenticacao(AuthenticationException e, HttpServletRequest req) {
        return resposta(HttpStatus.UNAUTHORIZED, "Autenticação necessária", req, List.of());
    }

    @ExceptionHandler({OperacaoProibidaException.class})
    ResponseEntity<ErroResposta> proibida(OperacaoProibidaException e, HttpServletRequest req) {
        return resposta(HttpStatus.FORBIDDEN, e.getMessage(), req, List.of());
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErroResposta> acessoNegado(AccessDeniedException e, HttpServletRequest req) {
        return resposta(HttpStatus.FORBIDDEN, "Acesso negado para o seu papel", req, List.of());
    }

    @ExceptionHandler({RecursoNaoEncontradoException.class})
    ResponseEntity<ErroResposta> naoEncontrado(RecursoNaoEncontradoException e, HttpServletRequest req) {
        return resposta(HttpStatus.NOT_FOUND, e.getMessage(), req, List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErroResposta> rotaInexistente(NoResourceFoundException e, HttpServletRequest req) {
        return resposta(HttpStatus.NOT_FOUND, "Recurso não encontrado", req, List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErroResposta> metodo(HttpRequestMethodNotSupportedException e, HttpServletRequest req) {
        return resposta(HttpStatus.METHOD_NOT_ALLOWED, "Método " + e.getMethod() + " não suportado nesta rota", req, List.of());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ErroResposta> tipoMidia(HttpMediaTypeNotSupportedException e, HttpServletRequest req) {
        return resposta(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Use Content-Type: application/json", req, List.of());
    }

    @ExceptionHandler(ConflitoException.class)
    ResponseEntity<ErroResposta> conflito(ConflitoException e, HttpServletRequest req) {
        return resposta(HttpStatus.CONFLICT, e.getMessage(), req, List.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErroResposta> integridade(DataIntegrityViolationException e, HttpServletRequest req) {
        log.warn("Violação de integridade em {}: {}", req.getRequestURI(), e.getMostSpecificCause().getMessage());
        return resposta(HttpStatus.CONFLICT, "A operação conflita com dados existentes", req, List.of());
    }

    @ExceptionHandler(MuitasTentativasException.class)
    ResponseEntity<ErroResposta> muitasTentativas(MuitasTentativasException e, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(e.getSegundosParaNovaTentativa()))
                .body(corpo(HttpStatus.TOO_MANY_REQUESTS, e.getMessage(), req, List.of()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErroResposta> inesperado(Exception e, HttpServletRequest req) {
        log.error("Erro inesperado em {} {}", req.getMethod(), req.getRequestURI(), e);
        return resposta(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno. Tente novamente mais tarde.", req, List.of());
    }

    private static ResponseEntity<ErroResposta> resposta(HttpStatus status, String mensagem, HttpServletRequest req,
                                                         List<ErroResposta.CampoInvalido> campos) {
        return ResponseEntity.status(status).body(corpo(status, mensagem, req, campos));
    }

    public static ErroResposta corpo(HttpStatus status, String mensagem, HttpServletRequest req,
                                     List<ErroResposta.CampoInvalido> campos) {
        return new ErroResposta(Instant.now(), status.value(), status.getReasonPhrase(), mensagem,
                req.getRequestURI(), campos);
    }

    private static String mensagem(FieldError f) {
        return f.getDefaultMessage() == null ? "inválido" : f.getDefaultMessage();
    }

    /** Só repassa ao cliente mensagens escritas por nós (IllegalArgumentException dos enums). */
    private static String causaLegivel(Throwable e) {
        Throwable causa = e;
        while (causa != null) {
            if (causa instanceof IllegalArgumentException && causa.getMessage() != null
                    && causa.getMessage().startsWith("Valor '")) {
                return causa.getMessage();
            }
            causa = causa.getCause();
        }
        return null;
    }

    /**
     * rmsG vira rms_g, para que o nome do campo no erro seja o mesmo do JSON. Chaves de mapa entre
     * colchetes (pontos[A]) ficam como vieram.
     */
    static String paraSnakeCase(String caminho) {
        StringBuilder sb = new StringBuilder(caminho.length() + 8);
        boolean dentroColchete = false;
        char anterior = 0;
        for (char c : caminho.toCharArray()) {
            if (c == '[') {
                dentroColchete = true;
            } else if (c == ']') {
                dentroColchete = false;
            }
            if (!dentroColchete && Character.isUpperCase(c)
                    && (Character.isLowerCase(anterior) || Character.isDigit(anterior))) {
                sb.append('_').append(Character.toLowerCase(c));
            } else {
                sb.append(c);
            }
            anterior = c;
        }
        return sb.toString();
    }
}
