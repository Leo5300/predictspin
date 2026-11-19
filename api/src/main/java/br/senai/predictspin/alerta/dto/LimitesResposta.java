package br.senai.predictspin.alerta.dto;

import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.ordemservico.PropriedadesOs;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.telemetria.FilaDeAvaliacao;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Limites em uso (application.yml, prefixos ps.referencia, ps.alarme, ps.os e ps.avaliacao). Todos são PROPOSTA a
 * confirmar com dado real; o painel interpola estes valores nos textos e nunca os escreve à mão.
 */
@Schema(name = "LimitesResposta")
public record LimitesResposta(PropriedadesReferencia referencia, PropriedadesAlarme alarme, PropriedadesOs os,
                              @Schema(description = "Fila da avaliação das janelas (ps.avaliacao)")
                              FilaDeAvaliacao.Propriedades avaliacao) {
}
