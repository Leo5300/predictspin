package br.senai.predictspin.maquina.dto;

import java.time.LocalDate;

import br.senai.predictspin.maquina.ClasseMaquina;
import br.senai.predictspin.maquina.Maquina;

public record MaquinaResposta(Long id, String codigo, ClasseMaquina classe, String modelo, String fabricante,
                              LocalDate dataInstalacao, boolean ativa, LocalResposta local) {

    public record LocalResposta(Long id, String nome, String tipo, String uf) {
    }

    /** Espera o local já carregado (JOIN FETCH). */
    public static MaquinaResposta de(Maquina m) {
        var l = m.getLocal();
        return new MaquinaResposta(m.getId(), m.getCodigo(), m.getClasse(), m.getModelo(), m.getFabricante(),
                m.getDataInstalacao(), m.isAtiva(), new LocalResposta(l.getId(), l.getNome(), l.getTipo(), l.getUf()));
    }
}
