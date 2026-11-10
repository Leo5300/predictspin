package br.senai.predictspin;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Relógio de teste que só anda quando mandado. */
public class RelogioAjustavel extends Clock {

    private Instant agora;

    public RelogioAjustavel(Instant inicio) {
        this.agora = inicio;
    }

    public void avancar(Duration duracao) {
        agora = agora.plus(duracao);
    }

    @Override
    public Instant instant() {
        return agora;
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }
}
