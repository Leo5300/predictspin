package br.senai.predictspin.maquina;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Unidade de aquisição (ESP32 ou simulador). A chave nunca é guardada, só o hash. */
@Entity
@Table(name = "dispositivo")
public class Dispositivo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "maquina_id")
    private Maquina maquina;

    private String identificador;

    private String credencialHash;

    private String firmwareVersao;

    private Instant ultimoContato;

    private boolean ativo;

    private boolean simulado;

    protected Dispositivo() {
    }

    public Dispositivo(Maquina maquina, String identificador, String credencialHash, boolean simulado) {
        this.maquina = maquina;
        this.identificador = identificador;
        this.credencialHash = credencialHash;
        this.simulado = simulado;
        this.ativo = true;
    }

    public Long getId() {
        return id;
    }

    public Maquina getMaquina() {
        return maquina;
    }

    public String getIdentificador() {
        return identificador;
    }

    public String getCredencialHash() {
        return credencialHash;
    }

    public String getFirmwareVersao() {
        return firmwareVersao;
    }

    public Instant getUltimoContato() {
        return ultimoContato;
    }

    public boolean isAtivo() {
        return ativo;
    }

    public boolean isSimulado() {
        return simulado;
    }
}
