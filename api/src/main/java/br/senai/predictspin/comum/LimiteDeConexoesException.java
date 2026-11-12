package br.senai.predictspin.comum;

import org.springframework.http.HttpStatus;

/**
 * Limite de conexões de eventos ao vivo excedido: 429 quando é o limite do usuário, 503 quando é o
 * do servidor. A resposta leva Retry-After.
 */
public class LimiteDeConexoesException extends RuntimeException {

    /** Espera sugerida ao cliente antes de tentar de novo, em segundos. */
    public static final long ESPERA_SEGUNDOS = 10;

    private final HttpStatus status;

    public LimiteDeConexoesException(HttpStatus status, String mensagem) {
        super(mensagem);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
