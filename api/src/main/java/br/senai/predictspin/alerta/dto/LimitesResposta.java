package br.senai.predictspin.alerta.dto;

import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.ordemservico.PropriedadesOs;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Limites em uso (application.yml, prefixos ps.referencia, ps.alarme e ps.os). Todos são PROPOSTA a
 * confirmar com dado real; o painel interpola estes valores nos textos e nunca os escreve à mão.
 */
@Schema(name = "LimitesResposta")
public record LimitesResposta(PropriedadesReferencia referencia, PropriedadesAlarme alarme, PropriedadesOs os) {
}
