package br.senai.predictspin.demo;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import br.senai.predictspin.demo.dto.EstadoDemoResposta;
import br.senai.predictspin.telemetria.FilaDeAvaliacao;

/**
 * "Zerar" da barra de demonstração: para o gerador e apaga, numa transação só, o que a demonstração deixa na
 * tela, e SÓ do dado simulado: ordens de serviço, alertas (o histórico e os envios de push saem em cascata),
 * estado dos pontos (a API recria NORMAL na próxima janela) e severidade acumulada. Dado real nunca é tocado; as
 * janelas e a referência simulada ficam (a barra precisa da referência).
 */
@Service
public class ZeragemDemoService {

    private static final Logger log = LoggerFactory.getLogger(ZeragemDemoService.class);

    /** Quanto esperar a fila de avaliação terminar as janelas já recebidas antes de apagar. */
    static final Duration ESPERA_FILA = Duration.ofSeconds(5);

    private final DemoService demo;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transacao;
    private final FilaDeAvaliacao fila;

    public ZeragemDemoService(DemoService demo, JdbcTemplate jdbc, TransactionTemplate transacao,
                              FilaDeAvaliacao fila) {
        this.demo = demo;
        this.jdbc = jdbc;
        this.transacao = transacao;
        this.fila = fila;
    }

    /** Contagem do que saiu. */
    public record Zerados(int ordensServico, int alertas, int estados, int severidades) {
    }

    public EstadoDemoResposta zerar(String usuario) {
        // 1. para o gerador (também confere que a demonstração está ligada: senão 404)
        demo.definir(NivelDemo.PARADA, usuario);
        // 2. deixa a avaliação terminar o que já chegou, para nenhum alerta nascer depois da limpeza
        fila.aguardarOcioso(ESPERA_FILA);
        // 3. apaga só o simulado; a OS vai antes porque aponta para o alerta
        Zerados z = transacao.execute(status -> new Zerados(
                jdbc.update("DELETE FROM ordem_servico WHERE simulado"),
                jdbc.update("DELETE FROM alerta WHERE simulado"),
                jdbc.update("DELETE FROM estado_ponto WHERE simulado"),
                jdbc.update("DELETE FROM severidade_acumulada WHERE simulado")));
        log.info("Demonstração zerada por {}: {} OS, {} alertas, {} estados de ponto e {} severidades simulados apagados",
                usuario, z.ordensServico(), z.alertas(), z.estados(), z.severidades());
        String texto = "Zerado: " + z.alertas() + (z.alertas() == 1 ? " alerta" : " alertas") + " e "
                + z.ordensServico() + (z.ordensServico() == 1 ? " OS simulada apagada" : " OS simuladas apagadas")
                + ". Demonstração parada.";
        return demo.avisar(texto);
    }
}
