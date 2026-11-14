package br.senai.predictspin.catalogo;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "material")
public class Material extends ItemCatalogo {

    protected Material() {
    }

    public Material(String nome, String descricao, Long criadoPor, Instant criadoEm) {
        super(nome, descricao, criadoPor, criadoEm);
    }
}
