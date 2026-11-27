package br.senai.predictspin.demo.dto;

import br.senai.predictspin.demo.NivelDemo;
import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.lang.Nullable;

/** Estado da barra de demonstração: o que o gerador está fazendo agora. */
public record EstadoDemoResposta(
        @Schema(description = "Sempre verdadeiro: com a demonstração desligada a rota responde 404")
        boolean habilitado,
        @Schema(description = "PARADA, NORMAL, ATENCAO ou ALARME") NivelDemo nivel,
        @Schema(description = "Segundos até ATENÇÃO ou ALARME voltarem sozinhos a NORMAL; nulo nos outros níveis")
        @Nullable Long voltaNormalEmS,
        @Schema(description = "Há referência ativa suficiente (T1 e T3) na marcha da demonstração, nos pontos A, B e C")
        boolean referenciaOk,
        @Schema(description = "Chegou janela de dispositivo real (não simulado) nos últimos 60 s: o gerador pausa")
        boolean hardwareRealAtivo,
        @Schema(description = "Texto em português para a barra mostrar") String mensagem) {
}
