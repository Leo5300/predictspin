package br.senai.predictspin.maquina;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.TreeSet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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

    private Instant modoRapidoAte;

    /** Rotações que a máquina oferece (placa de rotações do cabeçote). */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "rotacoes_nominais_rpm", columnDefinition = "integer[]")
    private List<Integer> rotacoesNominaisRpm = new ArrayList<>();

    /** Rotações escolhidas para a grade de cobertura da coleta; vazio = sem plano. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "rotacoes_coleta_rpm", columnDefinition = "integer[]")
    private List<Integer> rotacoesColetaRpm = new ArrayList<>();

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

    public Instant getModoRapidoAte() {
        return modoRapidoAte;
    }

    public List<Integer> getRotacoesNominaisRpm() {
        return rotacoesNominaisRpm;
    }

    public List<Integer> getRotacoesColetaRpm() {
        return rotacoesColetaRpm;
    }

    /** Grava o plano de coleta: rotações sem repetição, em ordem crescente. */
    public void definirRotacoesColeta(Collection<Integer> rotacoes) {
        this.rotacoesColetaRpm = new ArrayList<>(new TreeSet<>(rotacoes));
    }
}
