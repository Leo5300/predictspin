package br.senai.predictspin.seguranca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import br.senai.predictspin.comum.CredenciaisInvalidasException;
import br.senai.predictspin.comum.MuitasTentativasException;
import br.senai.predictspin.seguranca.dto.LoginRequisicao;

class AutenticacaoServiceTest {

    private UsuarioRepository usuarios;
    private PasswordEncoder codificador;
    private TokenService tokens;
    private LimiteTentativasService limite;
    private AutenticacaoService servico;
    private Usuario ana;

    @BeforeEach
    void criar() {
        usuarios = mock(UsuarioRepository.class);
        codificador = mock(PasswordEncoder.class);
        tokens = mock(TokenService.class);
        limite = mock(LimiteTentativasService.class);
        when(codificador.encode(anyString())).thenReturn("hash-ficticio");
        servico = new AutenticacaoService(usuarios, codificador, tokens, limite);
        ana = new Usuario("Ana", "ana@x.com", "hash-ana", Papel.TECNICO, Instant.EPOCH);
    }

    @Test
    void loginCorretoEmiteTokenEZeraFalhas() {
        when(usuarios.findByEmail("ana@x.com")).thenReturn(Optional.of(ana));
        when(codificador.matches("certa", "hash-ana")).thenReturn(true);
        when(tokens.emitir(ana)).thenReturn(new TokenService.TokenEmitido("tkn", Instant.EPOCH));

        var resposta = servico.entrar(new LoginRequisicao(" Ana@X.com ", "certa"), "1.1.1.1");

        assertThat(resposta.token()).isEqualTo("tkn");
        assertThat(resposta.tipo()).isEqualTo("Bearer");
        assertThat(resposta.usuario().papel()).isEqualTo(Papel.TECNICO);
        verify(limite).registrarSucesso("ana@x.com");
        verify(limite, never()).registrarFalha(anyString(), anyString());
    }

    @Test
    void senhaErradaRegistraFalha() {
        when(usuarios.findByEmail("ana@x.com")).thenReturn(Optional.of(ana));
        when(codificador.matches("errada", "hash-ana")).thenReturn(false);

        assertThatThrownBy(() -> servico.entrar(new LoginRequisicao("ana@x.com", "errada"), "1.1.1.1"))
                .isInstanceOf(CredenciaisInvalidasException.class);
        verify(limite).registrarFalha("1.1.1.1", "ana@x.com");
    }

    @Test
    void emailInexistenteAindaCompararaSenhaComHashFicticio() {
        when(usuarios.findByEmail(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> servico.entrar(new LoginRequisicao("zz@x.com", "s"), "1.1.1.1"))
                .isInstanceOf(CredenciaisInvalidasException.class);
        verify(codificador).matches("s", "hash-ficticio");
        verify(limite).registrarFalha("1.1.1.1", "zz@x.com");
    }

    @Test
    void usuarioInativoNaoEntraMesmoComSenhaCerta() {
        ana.desativar();
        when(usuarios.findByEmail("ana@x.com")).thenReturn(Optional.of(ana));
        when(codificador.matches("certa", "hash-ana")).thenReturn(true);

        assertThatThrownBy(() -> servico.entrar(new LoginRequisicao("ana@x.com", "certa"), "1.1.1.1"))
                .isInstanceOf(CredenciaisInvalidasException.class);
        verify(tokens, never()).emitir(any());
    }

    @Test
    void bloqueadoNemConsultaOBanco() {
        doThrow(new MuitasTentativasException(30)).when(limite).verificar("1.1.1.1", "ana@x.com");

        assertThatThrownBy(() -> servico.entrar(new LoginRequisicao("ana@x.com", "certa"), "1.1.1.1"))
                .isInstanceOf(MuitasTentativasException.class);
        verify(usuarios, never()).findByEmail(anyString());
    }
}
