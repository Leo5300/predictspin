package br.senai.predictspin.telemetria;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import br.senai.predictspin.telemetria.dto.TelemetriaPontoResposta;

public interface TelemetriaRepository extends JpaRepository<Telemetria, Long> {

    /** Série de um ponto, projetada direto para DTO: uma consulta por página, sem N+1. */
    @Query(value = """
            select new br.senai.predictspin.telemetria.dto.TelemetriaPontoResposta(
                j.id, j.medidoEm, j.recebidoEm, j.rotacaoRpm, j.saturou, e.id, d.identificador, d.simulado,
                t.rmsG, t.picoG, t.curtose, t.ordem1x, t.ordem2x, t.ordem3x)
            from Telemetria t
            join t.janela j
            join j.dispositivo d
            left join j.ensaio e
            where t.ponto.id = :pontoId
              and j.medidoEm >= :de and j.medidoEm < :ate
              and (:simulado is null or d.simulado = :simulado)
            order by j.medidoEm desc
            """,
            countQuery = """
            select count(t) from Telemetria t
            join t.janela j
            join j.dispositivo d
            where t.ponto.id = :pontoId
              and j.medidoEm >= :de and j.medidoEm < :ate
              and (:simulado is null or d.simulado = :simulado)
            """)
    Page<TelemetriaPontoResposta> seriePorPonto(@Param("pontoId") Long pontoId, @Param("de") Instant de,
                                                @Param("ate") Instant ate, @Param("simulado") Boolean simulado,
                                                Pageable pageable);

    @Query("select t from Telemetria t join fetch t.ponto p where t.janela.id = :janelaId order by p.codigo")
    List<Telemetria> daJanela(@Param("janelaId") Long janelaId);
}
