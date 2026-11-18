package br.senai.predictspin.alarme;

import java.time.Instant;

/** Memória da regra de um ponto (linha de estado_ponto): estado, temporizadores e severidade desde a OS. */
public final class EstadoPonto {

    final long pontoId;
    final boolean simulado;
    Nivel estado = Nivel.NORMAL;
    Instant ultimoMedidoEm;
    /** Desde quando z está seguido acima do limite de ATENÇÃO (e do de ALARME). */
    Instant atencaoDesde;
    Instant alarmeDesde;
    /** Desde quando z está seguido abaixo do limite de saída do estado atual. */
    Instant abaixoDesde;
    /** Desde quando o ponto está em ALARME (para a OS por alarme contínuo). */
    Instant emAlarmeDesde;
    Instant ausenteDesde;
    Instant sinalBaixoDesde;
    Instant falhaAmostragemEm;
    Instant instrumentoOkDesde;
    boolean instrumentoAtivo;
    double severidadeDesdeOs;

    public EstadoPonto(long pontoId, boolean simulado) {
        this.pontoId = pontoId;
        this.simulado = simulado;
    }

    public long pontoId() {
        return pontoId;
    }

    public boolean simulado() {
        return simulado;
    }

    public Nivel estado() {
        return estado;
    }

    public Instant ultimoMedidoEm() {
        return ultimoMedidoEm;
    }

    public Instant emAlarmeDesde() {
        return emAlarmeDesde;
    }

    public boolean instrumentoAtivo() {
        return instrumentoAtivo;
    }

    public double severidadeDesdeOs() {
        return severidadeDesdeOs;
    }

    public void zerarSeveridade() {
        severidadeDesdeOs = 0;
    }
}
