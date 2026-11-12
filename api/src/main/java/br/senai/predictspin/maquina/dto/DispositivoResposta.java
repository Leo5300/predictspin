package br.senai.predictspin.maquina.dto;

import org.springframework.lang.Nullable;
import java.time.Instant;

import br.senai.predictspin.maquina.Dispositivo;

/** Dispositivo sem a credencial: o hash nunca sai da API. */
public record DispositivoResposta(Long id, String identificador, @Nullable String firmwareVersao, @Nullable Instant ultimoContato,
                                  boolean ativo, boolean simulado) {

    public static DispositivoResposta de(Dispositivo d) {
        return new DispositivoResposta(d.getId(), d.getIdentificador(), d.getFirmwareVersao(), d.getUltimoContato(),
                d.isAtivo(), d.isSimulado());
    }
}
