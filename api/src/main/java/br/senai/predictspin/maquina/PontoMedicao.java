package br.senai.predictspin.maquina;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Ponto onde um acelerômetro está fixado. O código ("A", "B", "C") é a chave usada no payload. */
@Entity
@Table(name = "ponto_medicao")
public class PontoMedicao {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "maquina_id")
    private Maquina maquina;

    private String codigo;

    private PapelPonto papel;

    private String descricao;

    private String fixacao;

    private boolean ativo;

    protected PontoMedicao() {
    }

    public Long getId() {
        return id;
    }

    public Maquina getMaquina() {
        return maquina;
    }

    public String getCodigo() {
        return codigo;
    }

    public PapelPonto getPapel() {
        return papel;
    }

    public String getDescricao() {
        return descricao;
    }

    public String getFixacao() {
        return fixacao;
    }

    public boolean isAtivo() {
        return ativo;
    }
}
