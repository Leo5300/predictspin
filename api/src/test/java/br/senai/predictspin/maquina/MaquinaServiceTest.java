package br.senai.predictspin.maquina;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;

class MaquinaServiceTest {

    private static final Pageable PAGINA = PageRequest.of(0, 20);

    private MaquinaRepository maquinas;
    private PontoMedicaoRepository pontos;
    private DispositivoRepository dispositivos;
    private Maquina torno;
    private MaquinaService servico;

    @BeforeEach
    void criar() {
        maquinas = mock(MaquinaRepository.class);
        pontos = mock(PontoMedicaoRepository.class);
        dispositivos = mock(DispositivoRepository.class);
        Local local = mock(Local.class);
        when(local.getNome()).thenReturn("SENAI São Carlos");
        when(local.getUf()).thenReturn("SP");
        torno = mock(Maquina.class);
        when(torno.getId()).thenReturn(1L);
        when(torno.getCodigo()).thenReturn("TORNO-01");
        when(torno.getClasse()).thenReturn(ClasseMaquina.TORNO);
        when(torno.getModelo()).thenReturn("ROMI Tormax 30");
        when(torno.isAtiva()).thenReturn(true);
        when(torno.getLocal()).thenReturn(local);
        when(maquinas.findById(1L)).thenReturn(Optional.of(torno));
        when(maquinas.findById(99L)).thenReturn(Optional.empty());
        servico = new MaquinaService(maquinas, pontos, dispositivos);
    }

    @Test
    void listaMaquinasComOLocal() {
        when(maquinas.listarComLocal(PAGINA)).thenReturn(new PageImpl<>(List.of(torno), PAGINA, 1));

        var pagina = servico.listar(PAGINA);

        assertThat(pagina.totalElementos()).isEqualTo(1);
        var maquina = pagina.conteudo().get(0);
        assertThat(maquina.codigo()).isEqualTo("TORNO-01");
        assertThat(maquina.classe()).isEqualTo(ClasseMaquina.TORNO);
        assertThat(maquina.modelo()).isEqualTo("ROMI Tormax 30");
        assertThat(maquina.local().nome()).isEqualTo("SENAI São Carlos");
        assertThat(maquina.local().uf()).isEqualTo("SP");
    }

    @Test
    void listaPontosDaMaquina() {
        PontoMedicao a = mock(PontoMedicao.class);
        when(a.getCodigo()).thenReturn("A");
        when(a.getPapel()).thenReturn(PapelPonto.ACIONAMENTO);
        when(a.isAtivo()).thenReturn(true);
        when(pontos.listarPorMaquina(1L, PAGINA)).thenReturn(new PageImpl<>(List.of(a), PAGINA, 1));

        var pagina = servico.listarPontos(1L, PAGINA);

        assertThat(pagina.conteudo()).hasSize(1);
        assertThat(pagina.conteudo().get(0).codigo()).isEqualTo("A");
        assertThat(pagina.conteudo().get(0).papel()).isEqualTo(PapelPonto.ACIONAMENTO);
    }

    @Test
    void listaDispositivosRepassandoOFiltroSimulado() {
        Dispositivo sim = mock(Dispositivo.class);
        when(sim.getIdentificador()).thenReturn("ps-sim-01");
        when(sim.isSimulado()).thenReturn(true);
        when(sim.isAtivo()).thenReturn(true);
        when(sim.getUltimoContato()).thenReturn(Instant.parse("2026-11-10T12:00:00Z"));
        when(dispositivos.listarPorMaquina(1L, true, PAGINA)).thenReturn(new PageImpl<>(List.of(sim), PAGINA, 1));

        var pagina = servico.listarDispositivos(1L, true, PAGINA);

        assertThat(pagina.conteudo()).hasSize(1);
        assertThat(pagina.conteudo().get(0).identificador()).isEqualTo("ps-sim-01");
        assertThat(pagina.conteudo().get(0).simulado()).isTrue();
        assertThat(pagina.conteudo().get(0).ultimoContato()).isEqualTo(Instant.parse("2026-11-10T12:00:00Z"));
    }

    @Test
    void maquinaInexistenteEh404() {
        assertThatThrownBy(() -> servico.listarPontos(99L, PAGINA)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.listarDispositivos(99L, null, PAGINA))
                .isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.exigirMaquina(99L)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThat(servico.exigirMaquina(1L)).isSameAs(torno);
    }
}
