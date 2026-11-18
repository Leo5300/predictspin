package br.senai.predictspin.alerta.dto;

import java.time.Instant;
import java.util.List;

import org.springframework.lang.Nullable;

import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alerta.EstadoAlerta;
import io.swagger.v3.oas.annotations.media.Schema;

/** Alerta com o histórico de cada mudança de estado. */
public record AlertaDetalheResposta(AlertaResposta alerta, List<Mudanca> historico) {

    public record Mudanca(
            @Schema(allowableValues = {"abriu", "piorou", "melhorou", "normalizou", "reconhecido", "suprimido",
                    "supressao_encerrada", "encerrado"}) String acao,
            EstadoAlerta estado,
            Nivel nivel,
            @Schema(description = "Nome de quem agiu; nulo quando foi a regra") @Nullable String usuario,
            @Nullable String detalhe,
            Instant ocorridoEm) {
    }
}
