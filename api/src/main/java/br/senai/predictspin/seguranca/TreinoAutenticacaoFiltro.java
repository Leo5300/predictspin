package br.senai.predictspin.seguranca;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import br.senai.predictspin.ia.PropriedadesTreino;

/**
 * Autentica o serviço de treino (ou o comando no notebook) pelo cabeçalho X-Treino-Chave, comparado em tempo
 * constante com a variável de ambiente TREINO_CHAVE. Sem TREINO_CHAVE configurada, ninguém entra. Só é usado
 * na cadeia de segurança das rotas do serviço de treino.
 */
public class TreinoAutenticacaoFiltro extends OncePerRequestFilter {

    public static final String CABECALHO_CHAVE = "X-Treino-Chave";
    public static final String PAPEL_SERVICO_TREINO = "ROLE_SERVICO_TREINO";

    private final PropriedadesTreino treino;

    public TreinoAutenticacaoFiltro(PropriedadesTreino treino) {
        this.treino = treino;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp, FilterChain cadeia)
            throws ServletException, IOException {
        String chave = req.getHeader(CABECALHO_CHAVE);
        if (chave != null && treino.temChave() && MessageDigest.isEqual(
                chave.getBytes(StandardCharsets.UTF_8), treino.chave().getBytes(StandardCharsets.UTF_8))) {
            var autenticacao = new UsernamePasswordAuthenticationToken("servico-treino", null,
                    List.of(new SimpleGrantedAuthority(PAPEL_SERVICO_TREINO)));
            SecurityContext contexto = SecurityContextHolder.createEmptyContext();
            contexto.setAuthentication(autenticacao);
            SecurityContextHolder.setContext(contexto);
        }
        cadeia.doFilter(req, resp);
    }
}
