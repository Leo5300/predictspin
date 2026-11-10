package br.senai.predictspin.maquina;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.seguranca.HashChaveDispositivo;
import br.senai.predictspin.seguranca.PropriedadesSeguranca;

class DispositivoServiceTest {

    private DispositivoRepository dispositivos;
    private MaquinaRepository maquinas;
    private HashChaveDispositivo hash;
    private Maquina torno;
    private DispositivoService servico;

    @BeforeEach
    void criar() {
        dispositivos = mock(DispositivoRepository.class);
        maquinas = mock(MaquinaRepository.class);
        hash = new HashChaveDispositivo(new PropriedadesSeguranca(null, List.of(), null, "sal"));
        torno = mock(Maquina.class);
        when(torno.getId()).thenReturn(1L);
        when(maquinas.findByCodigo("TORNO-01")).thenReturn(Optional.of(torno));
        servico = new DispositivoService(dispositivos, maquinas, hash);
    }

    private Dispositivo existente(String chave, boolean ativo) {
        Dispositivo d = mock(Dispositivo.class);
        when(d.getId()).thenReturn(20L);
        when(d.getIdentificador()).thenReturn("ps-sim-01");
        when(d.getMaquina()).thenReturn(torno);
        when(d.getCredencialHash()).thenReturn(hash.calcular(chave));
        when(d.isAtivo()).thenReturn(ativo);
        when(d.isSimulado()).thenReturn(true);
        return d;
    }

    @Test
    void criaGuardandoSoOHashDaChave() {
        assertThat(servico.criarSeNaoExistir("ps-sim-01", "TORNO-01", "chave-secreta", true)).isTrue();

        ArgumentCaptor<Dispositivo> salvo = ArgumentCaptor.forClass(Dispositivo.class);
        verify(dispositivos).save(salvo.capture());
        assertThat(salvo.getValue().getIdentificador()).isEqualTo("ps-sim-01");
        assertThat(salvo.getValue().isSimulado()).isTrue();
        assertThat(salvo.getValue().getCredencialHash())
                .isEqualTo(hash.calcular("chave-secreta"))
                .doesNotContain("chave-secreta");
    }

    @Test
    void naoRecriaDispositivoExistente() {
        when(dispositivos.existsByIdentificador("ps-sim-01")).thenReturn(true);
        assertThat(servico.criarSeNaoExistir("ps-sim-01", "TORNO-01", "outra", true)).isFalse();
        verify(dispositivos, never()).save(any());
    }

    @Test
    void criarEmMaquinaInexistenteEh404() {
        when(maquinas.findByCodigo("FRESA-09")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> servico.criarSeNaoExistir("ps-x", "FRESA-09", "chave", false))
                .isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void autenticaComAChaveCerta() {
        Dispositivo d = existente("chave-certa", true);
        when(dispositivos.buscarPorIdentificador("ps-sim-01")).thenReturn(Optional.of(d));

        var autenticado = servico.autenticar(" ps-sim-01 ", "chave-certa");

        assertThat(autenticado).isPresent();
        assertThat(autenticado.get().id()).isEqualTo(20L);
        assertThat(autenticado.get().identificador()).isEqualTo("ps-sim-01");
        assertThat(autenticado.get().maquinaId()).isEqualTo(1L);
        assertThat(autenticado.get().simulado()).isTrue();
    }

    @Test
    void chaveErradaInativoOuInexistenteNaoAutenticam() {
        Dispositivo ativo = existente("chave-certa", true);
        when(dispositivos.buscarPorIdentificador("ps-sim-01")).thenReturn(Optional.of(ativo));
        assertThat(servico.autenticar("ps-sim-01", "chave-errada")).isEmpty();

        Dispositivo inativo = existente("chave-certa", false);
        when(dispositivos.buscarPorIdentificador("ps-sim-01")).thenReturn(Optional.of(inativo));
        assertThat(servico.autenticar("ps-sim-01", "chave-certa")).isEmpty();

        when(dispositivos.buscarPorIdentificador("ps-fantasma")).thenReturn(Optional.empty());
        assertThat(servico.autenticar("ps-fantasma", "chave-certa")).isEmpty();
    }

    @Test
    void cabecalhoAusenteOuVazioNemConsultaOBanco() {
        assertThat(servico.autenticar(null, "chave")).isEmpty();
        assertThat(servico.autenticar("  ", "chave")).isEmpty();
        assertThat(servico.autenticar("ps-sim-01", null)).isEmpty();
        assertThat(servico.autenticar("ps-sim-01", " ")).isEmpty();
        verify(dispositivos, never()).buscarPorIdentificador(any());
    }
}
