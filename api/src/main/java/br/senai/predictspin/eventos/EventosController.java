package br.senai.predictspin.eventos;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import br.senai.predictspin.maquina.ModoRapidoService;
import br.senai.predictspin.maquina.dto.ModoRapidoResposta;
import br.senai.predictspin.seguranca.Papel;
import br.senai.predictspin.seguranca.SegurancaConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Eventos ao vivo", description = "Fluxo SSE com o que acontece na máquina. Qualquer usuário autenticado.")
public class EventosController {

    private final EventosService eventos;
    private final ModoRapidoService modoRapido;

    public EventosController(EventosService eventos, ModoRapidoService modoRapido) {
        this.eventos = eventos;
        this.modoRapido = modoRapido;
    }

    @GetMapping(value = "/maquinas/{id}/eventos", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Eventos ao vivo da máquina (Server-Sent Events)",
            description = """
                    Fluxo text/event-stream. O token vai no cabeçalho Authorization, nunca na URL. Eventos:

                    - `janela`: janela nova gravada com medido_em de até 30 s atrás, com o corpo de JanelaResposta \
                    (reenvio não gera evento);
                    - `recuperacao`: janelas mais antigas que 30 s (a fila do dispositivo sendo esvaziada depois de \
                    uma queda de rede), juntadas no máximo a cada 5 s por máquina, com o corpo de RecuperacaoEvento \
                    (de, ate, quantidade); as janelas estão gravadas e aparecem nas consultas;
                    - `ensaio`: ensaio aberto, encerrado ou descartado, com o corpo de EnsaioEvento (só ADMIN e TECNICO);
                    - `alerta`: alerta aberto, piorado, normalizado, reconhecido, suprimido ou encerrado, com o \
                    corpo de AlertaEvento;
                    - `os`: ordem de serviço aberta, assumida ou concluída, com o corpo de OrdemServicoEvento;
                    - `modo_rapido`: modo rápido ligado ou desligado, com o corpo de ModoRapidoResposta; é também o \
                    primeiro evento de toda conexão, com o estado atual.

                    Linhas de comentário (`:batimento`) chegam a cada 15 s sem evento. A conexão é encerrada pelo \
                    servidor depois de 30 min; o cliente deve reconectar. Cliente que não consome é descartado.
                    """)
    @ApiResponse(responseCode = "200", description = "Fluxo de eventos",
            content = @Content(mediaType = MediaType.TEXT_EVENT_STREAM_VALUE, schema = @Schema(type = "string")))
    @ApiResponse(responseCode = "429", description = "Limite de conexões de eventos por usuário atingido")
    @ApiResponse(responseCode = "503", description = "Limite total de conexões de eventos do servidor atingido")
    public SseEmitter eventos(
            @PathVariable Long id,
            @Parameter(description = "Só eventos de dado simulado (true) ou real (false); sem o parâmetro, os dois")
            @RequestParam(required = false) Boolean simulado,
            @AuthenticationPrincipal Jwt jwt,
            HttpServletResponse resposta) {
        ModoRapidoResposta estado = modoRapido.consultar(id);
        String papel = jwt.getClaimAsString(SegurancaConfig.CLAIM_PAPEL);
        boolean veEnsaios = Papel.ADMIN.name().equals(papel) || Papel.TECNICO.name().equals(papel);
        // Sem cache e sem buffer no proxy: cada evento tem de sair assim que é escrito
        resposta.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache");
        resposta.setHeader("X-Accel-Buffering", "no");
        return eventos.assinar(id, Long.parseLong(jwt.getSubject()), veEnsaios, simulado, estado);
    }
}
