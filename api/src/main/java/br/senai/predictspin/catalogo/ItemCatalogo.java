package br.senai.predictspin.catalogo;

import java.time.Instant;

import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;

/** Item de catálogo (material ou ferramenta). Desativar esconde da escolha, não apaga. */
@MappedSuperclass
public abstract class ItemCatalogo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nome;

    private String nomeNormalizado;

    private String descricao;

    private boolean ativo = true;

    private Long criadoPor;

    private Instant criadoEm;

    protected ItemCatalogo() {
    }

    protected ItemCatalogo(String nome, String descricao, Long criadoPor, Instant criadoEm) {
        renomear(nome);
        this.descricao = descricao;
        this.criadoPor = criadoPor;
        this.criadoEm = criadoEm;
    }

    public final void renomear(String novoNome) {
        this.nome = NomeNormalizado.exibicao(novoNome);
        this.nomeNormalizado = NomeNormalizado.de(novoNome);
    }

    public void descrever(String novaDescricao) {
        this.descricao = novaDescricao;
    }

    public void desativar() {
        this.ativo = false;
    }

    public Long getId() {
        return id;
    }

    public String getNome() {
        return nome;
    }

    public String getNomeNormalizado() {
        return nomeNormalizado;
    }

    public String getDescricao() {
        return descricao;
    }

    public boolean isAtivo() {
        return ativo;
    }

    public Long getCriadoPor() {
        return criadoPor;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }
}
