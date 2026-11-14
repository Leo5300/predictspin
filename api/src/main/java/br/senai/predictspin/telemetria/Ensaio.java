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

import br.senai.predictspin.catalogo.Ferramenta;
import br.senai.predictspin.catalogo.Material;
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

    /** Material do catálogo; a coluna de texto "material" guarda o nome dele. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id")
    private Material materialItem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ferramenta_id")
    private Ferramenta ferramenta;

    private BigDecimal profundidadeCorteMm;

    private BigDecimal diametroPecaMm;

    private FluidoCorte fluidoCorte;

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

    /** Material do catálogo (ou nenhum): o texto passa a ser o nome do item. */
    public void definirMaterial(Material item) {
        this.materialItem = item;
        this.material = item == null ? null : item.getNome();
    }

    public void definirFerramenta(Ferramenta item) {
        this.ferramenta = item;
    }

    public void definirAvancoAlvo(BigDecimal valor) {
        this.avancoAlvo = valor;
    }

    public void definirProfundidadeCorteMm(BigDecimal valor) {
        this.profundidadeCorteMm = valor;
    }

    public void definirDiametroPecaMm(BigDecimal valor) {
        this.diametroPecaMm = valor;
    }

    public void definirFluidoCorte(FluidoCorte valor) {
        this.fluidoCorte = valor;
    }

    public void definirObservacao(String valor) {
        this.observacao = valor;
    }

    public Material getMaterialItem() {
        return materialItem;
    }

    public Ferramenta getFerramenta() {
        return ferramenta;
    }

    public BigDecimal getProfundidadeCorteMm() {
        return profundidadeCorteMm;
    }

    public BigDecimal getDiametroPecaMm() {
        return diametroPecaMm;
    }

    public FluidoCorte getFluidoCorte() {
        return fluidoCorte;
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
