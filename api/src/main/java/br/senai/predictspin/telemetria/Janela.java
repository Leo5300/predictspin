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

import br.senai.predictspin.maquina.Dispositivo;

/**
 * Um envio do dispositivo: horário da medição, rotação e ensaio. As medidas por ponto ficam em
 * {@link Telemetria} e as dos canais em {@link Leitura}. A gravação é feita pelo
 * {@link IngestaoRepository}; a entidade serve às consultas.
 */
@Entity
@Table(name = "janela")
public class Janela {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dispositivo_id")
    private Dispositivo dispositivo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ensaio_id")
    private Ensaio ensaio;

    private Instant medidoEm;

    private Instant recebidoEm;

    private double rotacaoRpm;

    private boolean saturou;

    private ModoJanela modo;

    private Integer amostras;

    private Integer amostrasEsperadas;

    protected Janela() {
    }

    public Long getId() {
        return id;
    }

    public Dispositivo getDispositivo() {
        return dispositivo;
    }

    public Ensaio getEnsaio() {
        return ensaio;
    }

    public Instant getMedidoEm() {
        return medidoEm;
    }

    public Instant getRecebidoEm() {
        return recebidoEm;
    }

    public double getRotacaoRpm() {
        return rotacaoRpm;
    }

    public boolean isSaturou() {
        return saturou;
    }

    public ModoJanela getModo() {
        return modo;
    }

    public Integer getAmostras() {
        return amostras;
    }

    public Integer getAmostrasEsperadas() {
        return amostrasEsperadas;
    }
}
