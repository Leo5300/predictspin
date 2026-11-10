package br.senai.predictspin.seguranca;

import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.CredenciaisInvalidasException;
import br.senai.predictspin.seguranca.dto.LoginRequisicao;
import br.senai.predictspin.seguranca.dto.LoginResposta;
import br.senai.predictspin.seguranca.dto.UsuarioResposta;

@Service
public class AutenticacaoService {

    private final UsuarioRepository usuarios;
    private final PasswordEncoder codificador;
    private final TokenService tokens;
    private final LimiteTentativasService limite;
    /** Hash de uma senha qualquer, para gastar o mesmo tempo quando o e-mail não existe. */
    private final String hashFicticio;

    public AutenticacaoService(UsuarioRepository usuarios, PasswordEncoder codificador, TokenService tokens,
                               LimiteTentativasService limite) {
        this.usuarios = usuarios;
        this.codificador = codificador;
        this.tokens = tokens;
        this.limite = limite;
        this.hashFicticio = codificador.encode("senha-ficticia-para-tempo-constante");
    }

    @Transactional(readOnly = true)
    public LoginResposta entrar(LoginRequisicao requisicao, String ip) {
        String email = UsuarioService.normalizarEmail(requisicao.email());
        limite.verificar(ip, email);

        Optional<Usuario> encontrado = usuarios.findByEmail(email);
        String hash = encontrado.map(Usuario::getSenhaHash).orElse(hashFicticio);
        boolean senhaConfere = codificador.matches(requisicao.senha(), hash);

        if (encontrado.isEmpty() || !senhaConfere || !encontrado.get().isAtivo()) {
            limite.registrarFalha(ip, email);
            throw new CredenciaisInvalidasException();
        }
        limite.registrarSucesso(email);
        Usuario usuario = encontrado.get();
        TokenService.TokenEmitido token = tokens.emitir(usuario);
        return new LoginResposta(token.token(), "Bearer", token.expiraEm(), UsuarioResposta.de(usuario));
    }
}
