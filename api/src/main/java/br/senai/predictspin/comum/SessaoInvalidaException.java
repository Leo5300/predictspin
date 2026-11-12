package br.senai.predictspin.comum;

/** Token válido, mas de usuário que não existe mais ou foi desativado: responde 401. */
public class SessaoInvalidaException extends RuntimeException {

    public SessaoInvalidaException() {
        super("Sessão inválida: entre novamente");
    }
}
