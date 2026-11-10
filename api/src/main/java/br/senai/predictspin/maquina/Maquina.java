package br.senai.predictspin.maquina;

import java.time.LocalDate;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "maquina")
public class Maquina {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "local_id")
    private Local local;

    private String codigo;

    private ClasseMaquina classe;

    private String modelo;

    private String fabricante;

    private LocalDate dataInstalacao;

    private boolean ativa;

    protected Maquina() {
    }

    public Long getId() {
        return id;
    }

    public Local getLocal() {
        return local;
    }

    public String getCodigo() {
        return codigo;
    }

    public ClasseMaquina getClasse() {
        return classe;
    }

    public String getModelo() {
        return modelo;
    }

    public String getFabricante() {
        return fabricante;
    }

    public LocalDate getDataInstalacao() {
        return dataInstalacao;
    }

    public boolean isAtiva() {
        return ativa;
    }
}
