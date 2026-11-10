package br.senai.predictspin.ordemservico;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import br.senai.predictspin.alerta.Alerta;
import br.senai.predictspin.alerta.RetornoTecnico;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.seguranca.Usuario;

/**
 * Ordem de serviço aberta a partir de um alerta. A abertura automática e o ciclo de vida ainda não
 * estão implementados: a tabela e o mapeamento já existem para que o esquema seja validado.
 */
@Entity
@Table(name = "ordem_servico")
public class OrdemServico {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "maquina_id")
    private Maquina maquina;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "alerta_id")
    private Alerta alerta;

    private Long componenteId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "responsavel_id")
    private Usuario responsavel;

    private String numero;

    private StatusOrdemServico status;

    private String tipoFalha;

    private Double severidadeAcumulada;

    private String pecaSugerida;

    private String versaoModelo;

    private RetornoTecnico retornoTecnico;

    private Instant abertaEm;

    private Instant concluidaEm;

    protected OrdemServico() {
    }

    public Long getId() {
        return id;
    }

    public Maquina getMaquina() {
        return maquina;
    }

    public Alerta getAlerta() {
        return alerta;
    }

    public Long getComponenteId() {
        return componenteId;
    }

    public Usuario getResponsavel() {
        return responsavel;
    }

    public String getNumero() {
        return numero;
    }

    public StatusOrdemServico getStatus() {
        return status;
    }

    public String getTipoFalha() {
        return tipoFalha;
    }

    public Double getSeveridadeAcumulada() {
        return severidadeAcumulada;
    }

    public String getPecaSugerida() {
        return pecaSugerida;
    }

    public String getVersaoModelo() {
        return versaoModelo;
    }

    public RetornoTecnico getRetornoTecnico() {
        return retornoTecnico;
    }

    public Instant getAbertaEm() {
        return abertaEm;
    }

    public Instant getConcluidaEm() {
        return concluidaEm;
    }
}
