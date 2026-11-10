package br.senai.predictspin.maquina.dto;

import br.senai.predictspin.maquina.PapelPonto;
import br.senai.predictspin.maquina.PontoMedicao;

public record PontoResposta(Long id, String codigo, PapelPonto papel, String descricao, String fixacao, boolean ativo) {

    public static PontoResposta de(PontoMedicao p) {
        return new PontoResposta(p.getId(), p.getCodigo(), p.getPapel(), p.getDescricao(), p.getFixacao(), p.isAtivo());
    }
}
