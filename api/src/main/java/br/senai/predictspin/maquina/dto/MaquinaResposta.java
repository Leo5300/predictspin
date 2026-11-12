package br.senai.predictspin.maquina.dto;

import org.springframework.lang.Nullable;
import java.time.LocalDate;
import java.util.List;

import br.senai.predictspin.maquina.ClasseMaquina;
import br.senai.predictspin.maquina.Maquina;
import io.swagger.v3.oas.annotations.media.Schema;

public record MaquinaResposta(
        Long id,
        String codigo,
        ClasseMaquina classe,
        String modelo,
        @Nullable String fabricante,
        @Nullable LocalDate dataInstalacao,
        boolean ativa,
        LocalResposta local,
        @Schema(description = "Rotações que a máquina oferece (placa de rotações), em rpm")
        List<Integer> rotacoesNominaisRpm,
        @Schema(description = "Rotações escolhidas para a grade de cobertura da coleta; vazio = sem plano")
        List<Integer> rotacoesColetaRpm) {

    public record LocalResposta(Long id, String nome, String tipo, String uf) {
    }

    /** Espera o local já carregado (JOIN FETCH). */
    public static MaquinaResposta de(Maquina m) {
        var l = m.getLocal();
        return new MaquinaResposta(m.getId(), m.getCodigo(), m.getClasse(), m.getModelo(), m.getFabricante(),
                m.getDataInstalacao(), m.isAtiva(), new LocalResposta(l.getId(), l.getNome(), l.getTipo(), l.getUf()),
                copia(m.getRotacoesNominaisRpm()), copia(m.getRotacoesColetaRpm()));
    }

    private static List<Integer> copia(List<Integer> lista) {
        return lista == null ? List.of() : List.copyOf(lista);
    }
}
