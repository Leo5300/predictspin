package br.senai.predictspin.comum;

/** E-mail ou senha incorretos, ou usuário inativo: responde 401 com mensagem genérica. */
public class CredenciaisInvalidasException extends RuntimeException {

    public CredenciaisInvalidasException() {
        super("E-mail ou senha inválidos");
    }
}
