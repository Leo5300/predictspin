package br.senai.predictspin.telemetria.dto;

import java.math.BigDecimal;
import java.time.Instant;

import org.springframework.lang.Nullable;

import br.senai.predictspin.catalogo.dto.RefCatalogo;
import br.senai.predictspin.telemetria.Condicao;
import br.senai.predictspin.telemetria.Ensaio;
import br.senai.predictspin.telemetria.Etapa;
import br.senai.predictspin.telemetria.FluidoCorte;

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
        @Nullable Instant encerradoEm,
        /* material e ferramenta do catálogo (id e nome); o texto de material é o nome do item */
        @Nullable RefCatalogo materialItem,
        @Nullable RefCatalogo ferramentaItem,
        @Nullable BigDecimal profundidadeCorteMm,
        @Nullable BigDecimal diametroPecaMm,
        @Nullable FluidoCorte fluidoCorte) {

    /** Sem a receita do catálogo (testes e chamadas antigas). */
    public EnsaioResposta(Long id, Long maquinaId, String codigo, Etapa etapa, Condicao condicao, String material,
                          Integer rotacaoAlvoRpm, BigDecimal avancoAlvo, Integer repeticao, String observacao,
                          boolean aberto, boolean descartado, boolean simulado, Instant iniciadoEm,
                          Instant encerradoEm) {
        this(id, maquinaId, codigo, etapa, condicao, material, rotacaoAlvoRpm, avancoAlvo, repeticao, observacao,
                aberto, descartado, simulado, iniciadoEm, encerradoEm, null, null, null, null, null);
    }

    /** Lê só o id da máquina (não inicializa o proxy). */
    public static EnsaioResposta de(Ensaio e) {
        return new EnsaioResposta(e.getId(), e.getMaquina().getId(), e.getCodigo(), e.getEtapa(), e.getCondicao(),
                e.getMaterial(), e.getRotacaoAlvoRpm(), e.getAvancoAlvo(), e.getRepeticao(), e.getObservacao(),
                e.isAberto(), e.isDescartado(), e.isSimulado(), e.getIniciadoEm(), e.getEncerradoEm(),
                RefCatalogo.de(e.getMaterialItem()), RefCatalogo.de(e.getFerramenta()), e.getProfundidadeCorteMm(),
                e.getDiametroPecaMm(), e.getFluidoCorte());
    }
}
