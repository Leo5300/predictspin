package br.senai.predictspin.telemetria;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import br.senai.predictspin.maquina.Canal;

/** Valor de um canal auxiliar (temperatura, umidade, corrente) em uma janela. */
@Entity
@Table(name = "leitura")
public class Leitura {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "janela_id")
    private Janela janela;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "canal_id")
    private Canal canal;

    private double valor;

    protected Leitura() {
    }

    public Long getId() {
        return id;
    }

    public Janela getJanela() {
        return janela;
    }

    public Canal getCanal() {
        return canal;
    }

    public double getValor() {
        return valor;
    }
}
