package br.senai.predictspin.catalogo;

import br.senai.predictspin.catalogo.dto.ItemCatalogoResposta;

/** Já existe item com o mesmo nome normalizado: responde 409 com o item existente no corpo. */
public class ItemDuplicadoException extends RuntimeException {

    private final transient ItemCatalogoResposta existente;

    public ItemDuplicadoException(String mensagem, ItemCatalogoResposta existente) {
        super(mensagem);
        this.existente = existente;
    }

    public ItemCatalogoResposta getExistente() {
        return existente;
    }
}
