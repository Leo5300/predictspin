package br.senai.predictspin.alerta.dto;

import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.ia.PropriedadesFusao;
import br.senai.predictspin.ia.PropriedadesModelo;
import br.senai.predictspin.ia.PropriedadesTendencia;
import br.senai.predictspin.ia.PropriedadesTreino;
import br.senai.predictspin.ordemservico.PropriedadesOs;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.telemetria.FilaDeAvaliacao;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Limites em uso (application.yml, prefixos ps.referencia, ps.alarme, ps.os, ps.avaliacao, ps.modelo, ps.treino,
 * ps.fusao e ps.tendencia). Todos são PROPOSTA a
 * confirmar com dado real; o painel interpola estes valores nos textos e nunca os escreve à mão.
 */
@Schema(name = "LimitesResposta")
public record LimitesResposta(PropriedadesReferencia referencia, PropriedadesAlarme alarme, PropriedadesOs os,
                              @Schema(description = "Fila da avaliação das janelas (ps.avaliacao)")
                              FilaDeAvaliacao.Propriedades avaliacao,
                              @Schema(description = "Modelos, segunda opinião (ps.modelo)") PropriedadesModelo modelo,
                              @Schema(description = "Treino (ps.treino), sem a chave nem o endereço do serviço")
                              PropriedadesTreino.Publicas treino,
                              @Schema(description = "Canais lentos na fusão (ps.fusao)") PropriedadesFusao fusao,
                              @Schema(description = "Tendência por ponto (ps.tendencia)") PropriedadesTendencia tendencia) {
}
