package br.senai.predictspin.ia;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Fusão com os canais lentos (próxima fase). Cada canal tem {@code ps.fusao.canais.<código>.habilitado}, falso
 * por padrão: desabilitado, o canal fica fora do vetor de características e a IA nunca depende dele.
 */
@ConfigurationProperties("ps.fusao")
@Schema(name = "PropriedadesFusao")
public record PropriedadesFusao(@DefaultValue Map<String, Canal> canais) {

    @Schema(name = "CanalFusao")
    public record Canal(@DefaultValue("false") boolean habilitado) {
    }

    /** Códigos dos canais habilitados, em ordem alfabética (a ordem das colunas do vetor). */
    public List<String> habilitados() {
        return new TreeMap<>(canais == null ? Map.<String, Canal>of() : canais).entrySet().stream()
                .filter(e -> e.getValue() != null && e.getValue().habilitado()).map(Map.Entry::getKey).toList();
    }
}
