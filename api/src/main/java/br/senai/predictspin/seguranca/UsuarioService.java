package br.senai.predictspin.seguranca;

import java.time.Clock;
import java.util.Locale;

import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.OperacaoProibidaException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.seguranca.dto.NovoUsuarioRequisicao;
import br.senai.predictspin.seguranca.dto.UsuarioResposta;

@Service
public class UsuarioService {

    private final UsuarioRepository repositorio;
    private final PasswordEncoder codificador;
    private final Clock relogio;

    public UsuarioService(UsuarioRepository repositorio, PasswordEncoder codificador, Clock relogio) {
        this.repositorio = repositorio;
        this.codificador = codificador;
        this.relogio = relogio;
    }

    public static String normalizarEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional
    public UsuarioResposta criar(NovoUsuarioRequisicao requisicao) {
        String email = normalizarEmail(requisicao.email());
        if (repositorio.existsByEmail(email)) {
            throw new ConflitoException("Já existe usuário com o e-mail " + email);
        }
        Usuario usuario = new Usuario(requisicao.nome().trim(), email, codificador.encode(requisicao.senha()),
                requisicao.papel(), relogio.instant());
        return UsuarioResposta.de(repositorio.save(usuario));
    }

    /** Usado na carga inicial: cria o usuário só se o e-mail ainda não existir. */
    @Transactional
    public boolean criarSeNaoExistir(String nome, String email, String senha, Papel papel) {
        if (repositorio.existsByEmail(normalizarEmail(email))) {
            return false;
        }
        criar(new NovoUsuarioRequisicao(nome, email, senha, papel));
        return true;
    }

    @Transactional(readOnly = true)
    public Pagina<UsuarioResposta> listar(Pageable pageable) {
        return Pagina.de(repositorio.listar(pageable), UsuarioResposta::de);
    }

    @Transactional
    public UsuarioResposta desativar(Long id, Long idSolicitante) {
        if (id.equals(idSolicitante)) {
            throw new OperacaoProibidaException("Um administrador não pode desativar a si mesmo");
        }
        Usuario usuario = repositorio.findById(id)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Usuário " + id + " não encontrado"));
        usuario.desativar();
        return UsuarioResposta.de(usuario);
    }
}
