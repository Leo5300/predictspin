package br.senai.predictspin.ia;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Modelos (segunda opinião). Todos os números são PROPOSTA a confirmar com dado real (docs/ia.md); saem na rota
 * de limites e os de treino vão ao serviço de treino junto com o conjunto, para o Python não ter outra cópia.
 *
 * @param ifPercentil        limiar do Isolation Forest: este percentil do escore nas janelas normais do treino
 * @param confiancaMin       abaixo disto o painel mostra "classe incerta"
 * @param tamanhoMaxMb       tamanho máximo de cada arquivo de modelo aceito pela API (MB)
 * @param arvoresIf          árvores do Isolation Forest
 * @param arvoresRf          árvores do Random Forest
 * @param profundidadeMaxRf  profundidade máxima de cada árvore do Random Forest (modelo pequeno)
 * @param semente            semente fixa do treino (reprodutível)
 * @param explicacaoTop      características citadas na explicação de cada janela
 */
@ConfigurationProperties("ps.modelo")
@Schema(name = "PropriedadesModelo")
public record PropriedadesModelo(
        @DefaultValue("99") double ifPercentil,
        @DefaultValue("0.6") double confiancaMin,
        @DefaultValue("5") int tamanhoMaxMb,
        @DefaultValue("100") int arvoresIf,
        @DefaultValue("60") int arvoresRf,
        @DefaultValue("10") int profundidadeMaxRf,
        @DefaultValue("42") int semente,
        @DefaultValue("3") int explicacaoTop) {

    public long tamanhoMaxBytes() {
        return tamanhoMaxMb * 1024L * 1024L;
    }
}
