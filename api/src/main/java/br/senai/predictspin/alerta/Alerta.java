package br.senai.predictspin.alerta;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import br.senai.predictspin.maquina.Canal;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.PontoMedicao;
import br.senai.predictspin.telemetria.Janela;

/**
 * Alerta gerado a partir de uma janela, apontando o ponto de medição ou o canal que saiu da faixa.
 * A geração automática (avaliação contra baseline e classificação) ainda não está implementada.
 */
@Entity
@Table(name = "alerta")
public class Alerta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "maquina_id")
    private Maquina maquina;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "janela_id")
    private Janela janela;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ponto_medicao_id")
    private PontoMedicao ponto;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "canal_id")
    private Canal canal;

    private Long baselineId;

    private String metrica;

    private double valor;

    private Double desvioSigma;

    private Severidade severidade;

    private String classificacaoFalha;

    private Double confianca;

    private String versaoModelo;

    private RetornoTecnico retornoTecnico;

    private Instant criadoEm;

    private Instant reconhecidoEm;

    protected Alerta() {
    }

    public Long getId() {
        return id;
    }

    public Maquina getMaquina() {
        return maquina;
    }

    public Janela getJanela() {
        return janela;
    }

    public PontoMedicao getPonto() {
        return ponto;
    }

    public Canal getCanal() {
        return canal;
    }

    public Long getBaselineId() {
        return baselineId;
    }

    public String getMetrica() {
        return metrica;
    }

    public double getValor() {
        return valor;
    }

    public Double getDesvioSigma() {
        return desvioSigma;
    }

    public Severidade getSeveridade() {
        return severidade;
    }

    public String getClassificacaoFalha() {
        return classificacaoFalha;
    }

    public Double getConfianca() {
        return confianca;
    }

    public String getVersaoModelo() {
        return versaoModelo;
    }

    public RetornoTecnico getRetornoTecnico() {
        return retornoTecnico;
    }

    public Instant getCriadoEm() {
        return criadoEm;
    }

    public Instant getReconhecidoEm() {
        return reconhecidoEm;
    }
}
