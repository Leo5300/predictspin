package br.senai.predictspin.maquina;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.dto.ModoRapidoResposta;

/**
 * Modo rápido (ao vivo): enquanto o prazo gravado na máquina estiver no futuro, a resposta da
 * ingestão avisa o dispositivo, que passa a mandar janelas de 1 s. O prazo fica no banco, e não em
 * memória, para valer mesmo depois de um reinício da API.
 */
@Service
public class ModoRapidoService {

    /** Quanto dura cada pedido; chamar de novo renova a partir do instante da chamada. */
    public static final Duration DURACAO = Duration.ofMinutes(2);

    private final MaquinaRepository maquinas;
    private final Clock relogio;

    public ModoRapidoService(MaquinaRepository maquinas, Clock relogio) {
        this.maquinas = maquinas;
        this.relogio = relogio;
    }

    @Transactional
    public ModoRapidoResposta ligar(Long maquinaId) {
        Instant ate = relogio.instant().plus(DURACAO).truncatedTo(ChronoUnit.MICROS);
        gravar(maquinaId, ate);
        return new ModoRapidoResposta(maquinaId, true, ate);
    }

    @Transactional
    public ModoRapidoResposta desligar(Long maquinaId) {
        gravar(maquinaId, null);
        return new ModoRapidoResposta(maquinaId, false, null);
    }

    @Transactional(readOnly = true)
    public ModoRapidoResposta consultar(Long maquinaId) {
        if (!maquinas.existsById(maquinaId)) {
            throw naoEncontrada(maquinaId);
        }
        Instant ate = vigente(maquinaId);
        return new ModoRapidoResposta(maquinaId, ate != null, ate);
    }

    /** Prazo do modo rápido se ainda estiver no futuro; nulo se desligado ou vencido. */
    @Transactional(readOnly = true)
    public Instant vigente(Long maquinaId) {
        Instant agora = relogio.instant();
        return maquinas.modoRapidoAte(maquinaId).filter(ate -> ate.isAfter(agora)).orElse(null);
    }

    private void gravar(Long maquinaId, Instant ate) {
        if (maquinas.definirModoRapido(maquinaId, ate) == 0) {
            throw naoEncontrada(maquinaId);
        }
    }

    private static RecursoNaoEncontradoException naoEncontrada(Long maquinaId) {
        return new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
    }
}
