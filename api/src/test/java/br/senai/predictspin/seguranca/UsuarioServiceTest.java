package br.senai.predictspin.seguranca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;

import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.OperacaoProibidaException;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.seguranca.dto.NovoUsuarioRequisicao;

class UsuarioServiceTest {

    private UsuarioRepository repositorio;
    private PasswordEncoder codificador;
    private UsuarioService servico;

    @BeforeEach
    void criar() {
        repositorio = mock(UsuarioRepository.class);
        codificador = mock(PasswordEncoder.class);
        when(codificador.encode("SenhaForte123")).thenReturn("hash");
        when(repositorio.save(any())).thenAnswer(i -> i.getArgument(0));
        servico = new UsuarioService(repositorio, codificador,
                Clock.fixed(Instant.parse("2026-11-10T12:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void criaComEmailNormalizadoESenhaCodificada() {
        var resposta = servico.criar(new NovoUsuarioRequisicao(" Bia ", " Bia@X.COM ", "SenhaForte123", Papel.OPERADOR));

        ArgumentCaptor<Usuario> salvo = ArgumentCaptor.forClass(Usuario.class);
        verify(repositorio).save(salvo.capture());
        assertThat(salvo.getValue().getEmail()).isEqualTo("bia@x.com");
        assertThat(salvo.getValue().getNome()).isEqualTo("Bia");
        assertThat(salvo.getValue().getSenhaHash()).isEqualTo("hash");
        assertThat(salvo.getValue().isAtivo()).isTrue();
        assertThat(resposta.criadoEm()).isEqualTo(Instant.parse("2026-11-10T12:00:00Z"));
    }

    @Test
    void emailDuplicadoEhConflito() {
        when(repositorio.existsByEmail("bia@x.com")).thenReturn(true);
        assertThatThrownBy(() -> servico.criar(new NovoUsuarioRequisicao("Bia", "bia@x.com", "SenhaForte123",
                Papel.OPERADOR))).isInstanceOf(ConflitoException.class);
        verify(repositorio, never()).save(any());
    }

    @Test
    void criarSeNaoExistirNaoSobrescreve() {
        when(repositorio.existsByEmail("adm@x.com")).thenReturn(true);
        assertThat(servico.criarSeNaoExistir("Adm", "ADM@x.com", "SenhaForte123", Papel.ADMIN)).isFalse();
        verify(repositorio, never()).save(any());

        when(repositorio.existsByEmail("novo@x.com")).thenReturn(false);
        assertThat(servico.criarSeNaoExistir("Novo", "novo@x.com", "SenhaForte123", Papel.ADMIN)).isTrue();
    }

    @Test
    void desativaUsuario() {
        var usuario = new Usuario("Caio", "caio@x.com", "h", Papel.TECNICO, Instant.EPOCH);
        when(repositorio.findById(7L)).thenReturn(Optional.of(usuario));
        assertThat(servico.desativar(7L, 1L).ativo()).isFalse();
    }

    @Test
    void naoDesativaASiMesmoNemInexistente() {
        assertThatThrownBy(() -> servico.desativar(1L, 1L)).isInstanceOf(OperacaoProibidaException.class);
        when(repositorio.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> servico.desativar(9L, 1L)).isInstanceOf(RecursoNaoEncontradoException.class);
    }
}
