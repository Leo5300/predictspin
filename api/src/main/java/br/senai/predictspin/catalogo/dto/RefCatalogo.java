package br.senai.predictspin.catalogo.dto;

import org.springframework.lang.Nullable;

import br.senai.predictspin.catalogo.ItemCatalogo;
import io.swagger.v3.oas.annotations.media.Schema;

/** Item do catálogo citado em outro recurso (o ensaio): só id e nome. */
@Schema(description = "Item do catálogo (material ou ferramenta): id e nome")
public record RefCatalogo(Long id, String nome) {

    @Nullable
    public static RefCatalogo de(@Nullable ItemCatalogo item) {
        return item == null ? null : new RefCatalogo(item.getId(), item.getNome());
    }
}
