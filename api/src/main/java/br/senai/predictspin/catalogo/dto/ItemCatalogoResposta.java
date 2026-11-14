package br.senai.predictspin.catalogo.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import br.senai.predictspin.catalogo.ItemCatalogo;

public record ItemCatalogoResposta(
        Long id,
        String nome,
        String nomeNormalizado,
        @Nullable String descricao,
        boolean ativo,
        @Nullable Long criadoPor,
        Instant criadoEm) {

    public static ItemCatalogoResposta de(ItemCatalogo i) {
        return new ItemCatalogoResposta(i.getId(), i.getNome(), i.getNomeNormalizado(), i.getDescricao(),
                i.isAtivo(), i.getCriadoPor(), i.getCriadoEm());
    }
}
