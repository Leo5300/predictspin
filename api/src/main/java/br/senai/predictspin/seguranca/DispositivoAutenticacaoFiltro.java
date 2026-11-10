package br.senai.predictspin.seguranca;

import java.io.IOException;
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

import br.senai.predictspin.maquina.DispositivoService;

/**
 * Autentica o dispositivo pelos cabeçalhos X-Dispositivo-Id e X-Dispositivo-Chave. Só é usado na
 * cadeia de segurança da ingestão; não é um bean, para não ser registrado em todas as rotas.
 */
public class DispositivoAutenticacaoFiltro extends OncePerRequestFilter {

    public static final String CABECALHO_ID = "X-Dispositivo-Id";
    public static final String CABECALHO_CHAVE = "X-Dispositivo-Chave";
    public static final String PAPEL_DISPOSITIVO = "ROLE_DISPOSITIVO";

    private final DispositivoService dispositivos;

    public DispositivoAutenticacaoFiltro(DispositivoService dispositivos) {
        this.dispositivos = dispositivos;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp, FilterChain cadeia)
            throws ServletException, IOException {
        String id = req.getHeader(CABECALHO_ID);
        String chave = req.getHeader(CABECALHO_CHAVE);
        if (id != null && chave != null) {
            dispositivos.autenticar(id, chave).ifPresent(dispositivo -> {
                var autenticacao = new UsernamePasswordAuthenticationToken(dispositivo, null,
                        List.of(new SimpleGrantedAuthority(PAPEL_DISPOSITIVO)));
                SecurityContext contexto = SecurityContextHolder.createEmptyContext();
                contexto.setAuthentication(autenticacao);
                SecurityContextHolder.setContext(contexto);
            });
        }
        cadeia.doFilter(req, resp);
    }
}
