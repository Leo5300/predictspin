package br.senai.predictspin.telemetria;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import br.senai.predictspin.maquina.PontoMedicao;

/** Características de vibração de um ponto de medição em uma janela. */
@Entity
@Table(name = "telemetria")
public class Telemetria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "janela_id")
    private Janela janela;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ponto_medicao_id")
    private PontoMedicao ponto;

    @Column(name = "rms_g")
    private double rmsG;

    @Column(name = "pico_g")
    private double picoG;

    private double curtose;

    @Column(name = "ordem_1x")
    private double ordem1x;

    @Column(name = "ordem_2x")
    private double ordem2x;

    @Column(name = "ordem_3x")
    private double ordem3x;

    protected Telemetria() {
    }

    public Long getId() {
        return id;
    }

    public Janela getJanela() {
        return janela;
    }

    public PontoMedicao getPonto() {
        return ponto;
    }

    public double getRmsG() {
        return rmsG;
    }

    public double getPicoG() {
        return picoG;
    }

    public double getCurtose() {
        return curtose;
    }

    public double getOrdem1x() {
        return ordem1x;
    }

    public double getOrdem2x() {
        return ordem2x;
    }

    public double getOrdem3x() {
        return ordem3x;
    }
}
