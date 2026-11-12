package br.senai.predictspin.telemetria.dto;

import org.springframework.lang.Nullable;
import java.math.BigDecimal;
import java.time.Instant;

import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.Ensaio;
import br.senai.predictspin.telemetria.Etapa;

public record EnsaioResposta(
        Long id,
        Long maquinaId,
        String codigo,
        Etapa etapa,
        Condicao condicao,
        @Nullable String material,
        Integer rotacaoAlvoRpm,
        @Nullable BigDecimal avancoAlvo,
        Integer repeticao,
        @Nullable String observacao,
        boolean aberto,
        boolean descartado,
        boolean simulado,
        Instant iniciadoEm,
        @Nullable Instant encerradoEm) {

    /** Lê só o id da máquina (não inicializa o proxy). */
    public static EnsaioResposta de(Ensaio e) {
        return new EnsaioResposta(e.getId(), e.getMaquina().getId(), e.getCodigo(), e.getEtapa(), e.getCondicao(),
                e.getMaterial(), e.getRotacaoAlvoRpm(), e.getAvancoAlvo(), e.getRepeticao(), e.getObservacao(),
                e.isAberto(), e.isDescartado(), e.isSimulado(), e.getIniciadoEm(), e.getEncerradoEm());
    }
}
