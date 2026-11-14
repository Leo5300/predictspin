package br.senai.predictspin.telemetria;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Uma correção de um campo da receita: valor antigo, novo, quem e quando. Nunca é apagada. */
@Entity
@Table(name = "ensaio_alteracao")
public class EnsaioAlteracao {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ensaio_id")
    private Ensaio ensaio;

    private String campo;

    private String valorAntigo;

    private String valorNovo;

    private Long alteradoPor;

    private Instant alteradoEm;

    protected EnsaioAlteracao() {
    }

    public EnsaioAlteracao(Ensaio ensaio, String campo, String valorAntigo, String valorNovo, Long alteradoPor,
                           Instant alteradoEm) {
        this.ensaio = ensaio;
        this.campo = campo;
        this.valorAntigo = valorAntigo;
        this.valorNovo = valorNovo;
        this.alteradoPor = alteradoPor;
        this.alteradoEm = alteradoEm;
    }

    public Long getId() {
        return id;
    }

    public Ensaio getEnsaio() {
        return ensaio;
    }

    public String getCampo() {
        return campo;
    }

    public String getValorAntigo() {
        return valorAntigo;
    }

    public String getValorNovo() {
        return valorNovo;
    }

    public Long getAlteradoPor() {
        return alteradoPor;
    }

    public Instant getAlteradoEm() {
        return alteradoEm;
    }
}
