package br.senai.predictspin.telemetria.dto;

import java.time.Instant;

import org.springframework.lang.Nullable;

import br.senai.predictspin.telemetria.EventoMarcado;
import br.senai.predictspin.telemetria.MotivoEvento;

/** Evento marcado num ensaio; também é o corpo do evento "evento_marcado" do fluxo ao vivo. */
public record EventoMarcadoResposta(
        Long id,
        Long ensaioId,
        String ensaioCodigo,
        Instant ocorridoEm,
        MotivoEvento motivo,
        @Nullable String nota,
        @Nullable Long criadoPor,
        Instant criadoEm) {

    public static EventoMarcadoResposta de(EventoMarcado e) {
        return new EventoMarcadoResposta(e.getId(), e.getEnsaio().getId(), e.getEnsaio().getCodigo(),
                e.getOcorridoEm(), e.getMotivo(), e.getNota(), e.getCriadoPor(), e.getCriadoEm());
    }
}
