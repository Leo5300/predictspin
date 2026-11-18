package br.senai.predictspin.eventos;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import br.senai.predictspin.eventos.dto.EnsaioEvento;
import br.senai.predictspin.maquina.ModoRapidoAlterado;
import br.senai.predictspin.telemetria.EnsaioAlterado;
import br.senai.predictspin.telemetria.EventoMarcadoGravado;
import br.senai.predictspin.telemetria.JanelaGravada;
import br.senai.predictspin.telemetria.JanelaRecuperada;

/**
 * Leva ao fluxo ao vivo o que os serviços anunciam, sempre DEPOIS do commit: evento de algo que foi
 * desfeito nunca sai. Aqui só se enfileira; ler do banco e escrever para os clientes fica com as
 * threads do {@link EventosService}.
 */
@Component
class OuvinteDeEventos {

    private final EventosService eventos;

    OuvinteDeEventos(EventosService eventos) {
        this.eventos = eventos;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoGravarJanela(JanelaGravada evento) {
        eventos.publicarJanela(evento.maquinaId(), evento.janelaId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoRecuperarJanela(JanelaRecuperada evento) {
        eventos.acumularRecuperacao(evento.maquinaId(), evento.simulado(), evento.medidoEm());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoAlterarEnsaio(EnsaioAlterado evento) {
        eventos.publicarEnsaio(evento.ensaio().maquinaId(), new EnsaioEvento(evento.acao(), evento.ensaio()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoMarcarEvento(EventoMarcadoGravado evento) {
        eventos.publicarEventoMarcado(evento.maquinaId(), evento.simulado(), evento.evento());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void aoAlterarModoRapido(ModoRapidoAlterado evento) {
        eventos.publicarModoRapido(evento.estado());
    }
}
