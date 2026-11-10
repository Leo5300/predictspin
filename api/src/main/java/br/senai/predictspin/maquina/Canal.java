package br.senai.predictspin.maquina;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Canal auxiliar (temperatura, umidade, corrente). O código é a chave usada em "canais" no payload. */
@Entity
@Table(name = "canal")
public class Canal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "maquina_id")
    private Maquina maquina;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ponto_medicao_id")
    private PontoMedicao ponto;

    private String codigo;

    private Grandeza grandeza;

    private String unidade;

    private String modeloSensor;

    private boolean ativo;

    protected Canal() {
    }

    public Long getId() {
        return id;
    }

    public Maquina getMaquina() {
        return maquina;
    }

    public PontoMedicao getPonto() {
        return ponto;
    }

    public String getCodigo() {
        return codigo;
    }

    public Grandeza getGrandeza() {
        return grandeza;
    }

    public String getUnidade() {
        return unidade;
    }

    public String getModeloSensor() {
        return modeloSensor;
    }

    public boolean isAtivo() {
        return ativo;
    }
}
