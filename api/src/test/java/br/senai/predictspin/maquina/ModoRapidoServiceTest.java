package br.senai.predictspin.maquina;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import br.senai.predictspin.RelogioAjustavel;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;

class ModoRapidoServiceTest {

    private static final Instant AGORA = Instant.parse("2026-11-11T12:00:00Z");

    private MaquinaRepository maquinas;
    private RelogioAjustavel relogio;
    private ModoRapidoService servico;

    @BeforeEach
    void criar() {
        maquinas = mock(MaquinaRepository.class);
        relogio = new RelogioAjustavel(AGORA);
        servico = new ModoRapidoService(maquinas, relogio);
    }

    @Test
    void ligarGravaDoisMinutosAPartirDeAgora() {
        when(maquinas.definirModoRapido(eq(1L), any())).thenReturn(1);

        var resposta = servico.ligar(1L);

        assertThat(resposta.ativo()).isTrue();
        assertThat(resposta.modoRapidoAte()).isEqualTo(AGORA.plusSeconds(120));
        verify(maquinas).definirModoRapido(1L, AGORA.plusSeconds(120));
    }

    @Test
    void desligarGravaNulo() {
        when(maquinas.definirModoRapido(eq(1L), isNull())).thenReturn(1);

        var resposta = servico.desligar(1L);

        assertThat(resposta.ativo()).isFalse();
        assertThat(resposta.modoRapidoAte()).isNull();
    }

    @Test
    void maquinaInexistenteDa404AoLigarDesligarOuConsultar() {
        when(maquinas.definirModoRapido(eq(9L), any())).thenReturn(0);
        when(maquinas.existsById(9L)).thenReturn(false);

        assertThatThrownBy(() -> servico.ligar(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.desligar(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.consultar(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void vigenteSoEnquantoOPrazoEstiverNoFuturo() {
        when(maquinas.modoRapidoAte(1L)).thenReturn(Optional.of(AGORA.plusSeconds(60)));
        assertThat(servico.vigente(1L)).isEqualTo(AGORA.plusSeconds(60));

        relogio.avancar(java.time.Duration.ofSeconds(60));
        assertThat(servico.vigente(1L)).isNull();

        when(maquinas.modoRapidoAte(1L)).thenReturn(Optional.empty());
        assertThat(servico.vigente(1L)).isNull();
    }

    @Test
    void consultarDizSeEstaAtivo() {
        when(maquinas.existsById(1L)).thenReturn(true);
        when(maquinas.modoRapidoAte(1L)).thenReturn(Optional.of(AGORA.plusSeconds(30)));

        var resposta = servico.consultar(1L);

        assertThat(resposta.ativo()).isTrue();
        assertThat(resposta.modoRapidoAte()).isEqualTo(AGORA.plusSeconds(30));
    }
}
