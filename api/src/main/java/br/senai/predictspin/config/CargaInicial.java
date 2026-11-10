package br.senai.predictspin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import br.senai.predictspin.maquina.DispositivoService;
import br.senai.predictspin.seguranca.Papel;
import br.senai.predictspin.seguranca.UsuarioService;

/**
 * Na subida, cria o usuário ADMIN e os dispositivos ps-torno-01 (real) e ps-sim-01 (simulado),
 * cada um com a própria chave, a partir de variáveis de ambiente. Nada é sobrescrito: se já
 * existir, fica como está. Variável vazia: o item é pulado com aviso no log.
 */
@Component
public class CargaInicial implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CargaInicial.class);
    private static final int TAMANHO_MINIMO_SENHA = 8;

    private final PropriedadesCargaInicial propriedades;
    private final UsuarioService usuarios;
    private final DispositivoService dispositivos;

    public CargaInicial(PropriedadesCargaInicial propriedades, UsuarioService usuarios, DispositivoService dispositivos) {
        this.propriedades = propriedades;
        this.usuarios = usuarios;
        this.dispositivos = dispositivos;
    }

    @Override
    public void run(ApplicationArguments args) {
        criarAdmin();
        criarDispositivo(propriedades.dispositivoReal(), propriedades.chaveDispositivoReal(), false,
                "DISPOSITIVO_TORNO_CHAVE");
        criarDispositivo(propriedades.dispositivoSimulado(), propriedades.chaveDispositivoSimulado(), true,
                "DISPOSITIVO_SIM_CHAVE");
    }

    private void criarAdmin() {
        String email = propriedades.adminEmail();
        String senha = propriedades.adminSenha();
        if (vazio(email) || vazio(senha)) {
            log.warn("ADMIN_EMAIL ou ADMIN_SENHA não definidos: usuário administrador inicial não foi criado");
            return;
        }
        if (senha.length() < TAMANHO_MINIMO_SENHA) {
            log.warn("ADMIN_SENHA tem menos de {} caracteres: usuário administrador inicial não foi criado",
                    TAMANHO_MINIMO_SENHA);
            return;
        }
        if (usuarios.criarSeNaoExistir(propriedades.adminNome(), email, senha, Papel.ADMIN)) {
            log.info("Usuário administrador inicial criado");
        }
    }

    private void criarDispositivo(String identificador, String chave, boolean simulado, String variavel) {
        if (vazio(chave)) {
            log.warn("{} não definida: dispositivo {} não foi criado", variavel, identificador);
            return;
        }
        if (dispositivos.criarSeNaoExistir(identificador, propriedades.maquinaCodigo(), chave, simulado)) {
            log.info("Dispositivo {} criado na máquina {}", identificador, propriedades.maquinaCodigo());
        }
    }

    private static boolean vazio(String valor) {
        return valor == null || valor.isBlank();
    }
}
