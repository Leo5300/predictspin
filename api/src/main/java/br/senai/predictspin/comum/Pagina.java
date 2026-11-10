package br.senai.predictspin.comum;

import java.util.List;
import java.util.function.Function;

import org.springframework.data.domain.Page;

/** Envelope de resposta paginada, com nomes estáveis (independe da serialização do Spring Data). */
public record Pagina<T>(
        List<T> conteudo,
        int pagina,
        int tamanho,
        long totalElementos,
        int totalPaginas) {

    public static <T> Pagina<T> de(Page<T> page) {
        return new Pagina<>(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }

    public static <E, T> Pagina<T> de(Page<E> page, Function<E, T> conversor) {
        return de(page.map(conversor));
    }
}
