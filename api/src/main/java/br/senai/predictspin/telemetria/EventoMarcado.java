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

/**
 * Instante, dentro de um ensaio aberto, em que algo fora do plano aconteceu (pancada na bancada,
 * cavaco enroscado, máquina vizinha ligada). As janelas que o contêm saem do treino.
 */
@Entity
@Table(name = "ensaio_evento")
public class EventoMarcado {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ensaio_id")
    private Ensaio ensaio;

    private Instant ocorridoEm;

    private MotivoEvento motivo;

    private String nota;

    private Long criadoPor;

    private Instant criadoEm;

    protected EventoMarcado() {
    }

    public EventoMarcado(Ensaio ensaio, Instant ocorridoEm, MotivoEvento motivo, String nota, Long criadoPor,
                         Instant criadoEm) {
        this.ensaio = ensaio;
        this.ocorridoEm = ocorridoEm;
        this.motivo = motivo;
        this.nota = nota;
        this.criadoPor = criadoPor;
        this.criadoEm = criadoEm;
    }

    public Long getId() {
        return id;
    }

    public Ensaio getEnsaio() {
        return ensaio;
    }

    public Instant getOcorridoEm() {
        return ocorridoEm;
    }

    public MotivoEvento getMotivo() {
        return motivo;
    }

    public String getNota() {
        return nota;
    }

    public Long getCriadoPor() {
        return criadoPor;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }
}
