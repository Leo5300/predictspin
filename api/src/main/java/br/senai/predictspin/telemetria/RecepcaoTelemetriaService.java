package br.senai.predictspin.telemetria;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.telemetria.dto.TelemetriaRequisicao;

/**
 * Entrada do POST /api/v1/telemetria. Sem transação de propósito: a ingestão grava a janela e faz o
 * commit (a conexão volta ao pool) e só DEPOIS vêm, nesta ordem, a avaliação contra a referência
 * ({@link JanelaRecebida}, protegida e em transação própria) e o anúncio ao fluxo ao vivo
 * ({@link JanelaGravada} ou {@link JanelaRecuperada}), para a janela já sair avaliada no painel.
 * <p>
 * Antes a avaliação rodava no afterCommit da ingestão: nesse momento a conexão da ingestão ainda não foi
 * devolvida, e a transação da avaliação pegava uma segunda. Com 20 dispositivos ao mesmo tempo e pool de
 * 10, todas as threads esperavam a segunda conexão até o prazo de 30 s do pool (medição do k6 em
 * docs/alarmes.md).
 */
@Service
public class RecepcaoTelemetriaService {

    private final IngestaoService ingestao;
    private final ApplicationEventPublisher anuncios;

    public RecepcaoTelemetriaService(IngestaoService ingestao, ApplicationEventPublisher anuncios) {
        this.ingestao = ingestao;
        this.anuncios = anuncios;
    }

    public IngestaoService.Resultado receber(DispositivoAutenticado dispositivo, TelemetriaRequisicao requisicao) {
        IngestaoService.Resultado resultado = ingestao.receber(dispositivo, requisicao);
        JanelaRecebida janela = resultado.recebida();
        if (janela != null) {
            anuncios.publishEvent(janela);
            anuncios.publishEvent(janela.aoVivo()
                    ? new JanelaGravada(janela.maquinaId(), janela.janelaId())
                    : new JanelaRecuperada(janela.maquinaId(), janela.simulado(), janela.medidoEm()));
        }
        return resultado;
    }
}
