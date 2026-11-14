package br.senai.predictspin.catalogo;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "ferramenta")
public class Ferramenta extends ItemCatalogo {

    protected Ferramenta() {
    }

    public Ferramenta(String nome, String descricao, Long criadoPor, Instant criadoEm) {
        super(nome, descricao, criadoPor, criadoEm);
    }
}
