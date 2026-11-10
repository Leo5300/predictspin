package br.senai.predictspin.comum;

/** Autenticado, mas sem direito à operação pedida: responde 403. */
public class OperacaoProibidaException extends RuntimeException {

    public OperacaoProibidaException(String mensagem) {
        super(mensagem);
    }
}
