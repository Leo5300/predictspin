package br.senai.predictspin.maquina;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import br.senai.predictspin.maquina.dto.ModoRapidoResposta;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/maquinas/{id}/modo-rapido")
@Tag(name = "Máquinas")
public class ModoRapidoController {

    private final ModoRapidoService servico;

    public ModoRapidoController(ModoRapidoService servico) {
        this.servico = servico;
    }

    @PostMapping
    @Operation(summary = "Liga o modo rápido (janelas de 1 s) por 2 minutos a partir de agora",
            description = "Qualquer usuário autenticado. Chamar de novo renova o prazo. Enquanto valer, a resposta "
                    + "da ingestão dos dispositivos da máquina traz modo_rapido_ate.")
    @ApiResponse(responseCode = "200", description = "Modo rápido ligado, com o prazo")
    @ApiResponse(responseCode = "404", description = "Máquina inexistente")
    public ModoRapidoResposta ligar(@PathVariable Long id) {
        return servico.ligar(id);
    }

    @DeleteMapping
    @Operation(summary = "Desliga o modo rápido; o dispositivo volta a janelas de 5 s no envio seguinte")
    @ApiResponse(responseCode = "200", description = "Modo rápido desligado")
    @ApiResponse(responseCode = "404", description = "Máquina inexistente")
    public ModoRapidoResposta desligar(@PathVariable Long id) {
        return servico.desligar(id);
    }

    @GetMapping
    @Operation(summary = "Diz se o modo rápido está valendo e até quando")
    @ApiResponse(responseCode = "404", description = "Máquina inexistente")
    public ModoRapidoResposta consultar(@PathVariable Long id) {
        return servico.consultar(id);
    }
}
