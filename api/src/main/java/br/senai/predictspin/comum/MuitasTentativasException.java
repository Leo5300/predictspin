package br.senai.predictspin.comum;

/** Limite de tentativas excedido: responde 429 com o cabeçalho Retry-After. */
public class MuitasTentativasException extends RuntimeException {

    private final long segundosParaNovaTentativa;

    public MuitasTentativasException(long segundosParaNovaTentativa) {
        super("Muitas tentativas de login. Tente novamente mais tarde.");
        this.segundosParaNovaTentativa = segundosParaNovaTentativa;
    }

    public long getSegundosParaNovaTentativa() {
        return segundosParaNovaTentativa;
    }
}
