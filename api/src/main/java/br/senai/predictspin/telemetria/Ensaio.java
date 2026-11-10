package br.senai.predictspin.telemetria;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import br.senai.predictspin.maquina.Maquina;

/** Período de coleta rotulada: as janelas recebidas enquanto está aberto herdam seus rótulos. */
@Entity
@Table(name = "ensaio")
public class Ensaio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "maquina_id")
    private Maquina maquina;

    private String codigo;

    @Enumerated(EnumType.STRING)
    private Etapa etapa;

    private Condicao condicao;

    private String material;

    private Integer rotacaoAlvoRpm;

    private BigDecimal avancoAlvo;

    private Integer repeticao;

    private String observacao;

    private boolean descartado;

    private boolean simulado;

    private Instant iniciadoEm;

    private Instant encerradoEm;

    protected Ensaio() {
    }

    public Ensaio(Maquina maquina, String codigo, Etapa etapa, Condicao condicao, String material,
                  Integer rotacaoAlvoRpm, BigDecimal avancoAlvo, Integer repeticao, String observacao,
                  boolean simulado, Instant iniciadoEm) {
        this.maquina = maquina;
        this.codigo = codigo;
        this.etapa = etapa;
        this.condicao = condicao;
        this.material = material;
        this.rotacaoAlvoRpm = rotacaoAlvoRpm;
        this.avancoAlvo = avancoAlvo;
        this.repeticao = repeticao;
        this.observacao = observacao;
        this.simulado = simulado;
        this.iniciadoEm = iniciadoEm;
    }

    public boolean isAberto() {
        return encerradoEm == null;
    }

    public void encerrar(Instant instante) {
        this.encerradoEm = instante;
    }

    public void descartar(Instant instante) {
        this.descartado = true;
        if (isAberto()) {
            this.encerradoEm = instante;
        }
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

    public Etapa getEtapa() {
        return etapa;
    }

    public Condicao getCondicao() {
        return condicao;
    }

    public String getMaterial() {
        return material;
    }

    public Integer getRotacaoAlvoRpm() {
        return rotacaoAlvoRpm;
    }

    public BigDecimal getAvancoAlvo() {
        return avancoAlvo;
    }

    public Integer getRepeticao() {
        return repeticao;
    }

    public String getObservacao() {
        return observacao;
    }

    public boolean isDescartado() {
        return descartado;
    }

    public boolean isSimulado() {
        return simulado;
    }

    public Instant getIniciadoEm() {
        return iniciadoEm;
    }

    public Instant getEncerradoEm() {
        return encerradoEm;
    }
}
