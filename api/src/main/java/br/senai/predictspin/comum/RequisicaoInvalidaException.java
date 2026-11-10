package br.senai.predictspin.comum;

/** Dado de entrada inválido que a Bean Validation não cobre: responde 400. */
public class RequisicaoInvalidaException extends RuntimeException {

    public RequisicaoInvalidaException(String mensagem) {
        super(mensagem);
    }
}
