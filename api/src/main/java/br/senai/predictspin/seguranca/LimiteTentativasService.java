package br.senai.predictspin.seguranca;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import br.senai.predictspin.comum.MuitasTentativasException;

/**
 * Limita tentativas de login com falha, em janela deslizante, separadamente por IP e por e-mail.
 * Ao atingir o limite, novas tentativas recebem 429 até a falha mais antiga sair da janela.
 * <p>
 * O estado fica em memória: vale por instância da API, o que basta para uma instância única.
 */
@Service
public class LimiteTentativasService {

    private final Map<String, Deque<Instant>> falhas = new ConcurrentHashMap<>();
    private final Clock relogio;
    private final int maxPorEmail;
    private final int maxPorIp;
    private final Duration janela;

    public LimiteTentativasService(Clock relogio, PropriedadesSeguranca propriedades) {
        this.relogio = relogio;
        this.maxPorEmail = propriedades.login().maxTentativasEmail();
        this.maxPorIp = propriedades.login().maxTentativasIp();
        this.janela = Duration.ofSeconds(propriedades.login().janelaSegundos());
    }

    /** Lança {@link MuitasTentativasException} se o IP ou o e-mail já estourou o limite. */
    public void verificar(String ip, String email) {
        Instant agora = relogio.instant();
        long espera = Math.max(segundosDeEspera(chaveIp(ip), maxPorIp, agora),
                segundosDeEspera(chaveEmail(email), maxPorEmail, agora));
        if (espera > 0) {
            throw new MuitasTentativasException(espera);
        }
    }

    public void registrarFalha(String ip, String email) {
        Instant agora = relogio.instant();
        registrar(chaveIp(ip), agora);
        registrar(chaveEmail(email), agora);
    }

    /** Login bem-sucedido zera as falhas do e-mail; as do IP continuam contando. */
    public void registrarSucesso(String email) {
        falhas.remove(chaveEmail(email));
    }

    @Scheduled(fixedDelay = 60_000)
    public void limparExpiradas() {
        Instant limite = relogio.instant().minus(janela);
        falhas.entrySet().removeIf(entrada -> {
            Deque<Instant> fila = entrada.getValue();
            synchronized (fila) {
                descartarAntigas(fila, limite);
                return fila.isEmpty();
            }
        });
    }

    private long segundosDeEspera(String chave, int maximo, Instant agora) {
        Deque<Instant> fila = falhas.get(chave);
        if (fila == null) {
            return 0;
        }
        synchronized (fila) {
            descartarAntigas(fila, agora.minus(janela));
            if (fila.size() < maximo) {
                return 0;
            }
            Instant liberaEm = fila.peekFirst().plus(janela);
            return Math.max(1, Duration.between(agora, liberaEm).toSeconds());
        }
    }

    private void registrar(String chave, Instant agora) {
        Deque<Instant> fila = falhas.computeIfAbsent(chave, k -> new ArrayDeque<>());
        synchronized (fila) {
            fila.addLast(agora);
        }
    }

    private static void descartarAntigas(Deque<Instant> fila, Instant limite) {
        while (!fila.isEmpty() && !fila.peekFirst().isAfter(limite)) {
            fila.pollFirst();
        }
    }

    private static String chaveIp(String ip) {
        return "ip:" + ip;
    }

    private static String chaveEmail(String email) {
        return "email:" + UsuarioService.normalizarEmail(email);
    }
}
