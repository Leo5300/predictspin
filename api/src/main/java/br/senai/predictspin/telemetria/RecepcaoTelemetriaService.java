package br.senai.predictspin.telemetria;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;

/**
 * Entrada do POST /api/v1/telemetria. Sem transação de propósito: a ingestão grava a janela e faz o
 * commit (a conexão volta ao pool) e a resposta sai. A avaliação contra a referência ({@link JanelaRecebida},
 * protegida e em transação própria) e o anúncio ao fluxo ao vivo ({@link JanelaGravada} ou
 * {@link JanelaRecuperada}) rodam DEPOIS, nesta ordem, na {@link FilaDeAvaliacao} da máquina: a janela sai no
 * painel já avaliada, e a resposta ao dispositivo não espera a avaliação.
 * <p>
 * Medição de 19/11/2026 (docs/teste-de-carga.md): com a avaliação na thread do pedido, metade do tempo da
 * resposta era avaliação, as avaliações da mesma máquina faziam fila na trava de estado_ponto e o pool de 10
 * conexões chegava a ter 10 threads esperando. Antes disso a avaliação rodava no afterCommit da ingestão e
 * pegava uma segunda conexão com a primeira ainda presa (docs/alarmes.md).
 */
@Service
public class RecepcaoTelemetriaService {

    private final IngestaoService ingestao;
    private final ApplicationEventPublisher anuncios;
    private final FilaDeAvaliacao fila;

    public RecepcaoTelemetriaService(IngestaoService ingestao, ApplicationEventPublisher anuncios,
                                     FilaDeAvaliacao fila) {
        this.ingestao = ingestao;
        this.anuncios = anuncios;
        this.fila = fila;
    }

    public IngestaoService.Resultado receber(DispositivoAutenticado dispositivo, TelemetriaRequisicao requisicao) {
        return receber(dispositivo, requisicao, false);
    }

    /** Igual ao POST /telemetria; {@code demonstracao} marca a janela da barra de demonstração (sem ensaio). */
    public IngestaoService.Resultado receber(DispositivoAutenticado dispositivo, TelemetriaRequisicao requisicao,
                                             boolean demonstracao) {
        IngestaoService.Resultado resultado = ingestao.receber(dispositivo, requisicao, demonstracao);
        JanelaRecebida janela = resultado.recebida();
        if (janela != null) {
            fila.enfileirar(janela.maquinaId(), janela.simulado(), () -> {
                anuncios.publishEvent(janela);
                anuncios.publishEvent(janela.aoVivo()
                        ? new JanelaGravada(janela.maquinaId(), janela.janelaId())
                        : new JanelaRecuperada(janela.maquinaId(), janela.simulado(), janela.medidoEm()));
            });
        }
        return resultado;
    }
}
