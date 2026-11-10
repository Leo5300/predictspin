package br.senai.predictspin.comum;

/** Operação conflita com o estado atual (ex.: segundo ensaio aberto): responde 409. */
public class ConflitoException extends RuntimeException {

    public ConflitoException(String mensagem) {
        super(mensagem);
    }
}
