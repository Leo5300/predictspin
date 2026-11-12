package br.senai.predictspin.telemetria;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JanelaRepository extends JpaRepository<Janela, Long> {

    /** Janelas mais recentes da máquina (use Pageable de tamanho 1 para a última). */
    @Query("""
            select j from Janela j
            join fetch j.dispositivo d
            left join fetch j.ensaio
            where d.maquina.id = :maquinaId
              and (:simulado is null or d.simulado = :simulado)
            order by j.medidoEm desc
            """)
    List<Janela> maisRecentes(@Param("maquinaId") Long maquinaId, @Param("simulado") Boolean simulado,
                              Pageable pageable);

    /** Janelas da máquina no período, com dispositivo e ensaio já carregados; a ordem vem do Pageable. */
    @Query(value = """
            select j from Janela j
            join fetch j.dispositivo d
            left join fetch j.ensaio
            where d.maquina.id = :maquinaId
              and j.medidoEm >= :de and j.medidoEm < :ate
              and (:simulado is null or d.simulado = :simulado)
              and (:modo is null or j.modo = :modo)
            """,
            countQuery = """
            select count(j) from Janela j
            join j.dispositivo d
            where d.maquina.id = :maquinaId
              and j.medidoEm >= :de and j.medidoEm < :ate
              and (:simulado is null or d.simulado = :simulado)
              and (:modo is null or j.modo = :modo)
            """)
    Page<Janela> daMaquina(@Param("maquinaId") Long maquinaId, @Param("de") Instant de, @Param("ate") Instant ate,
                           @Param("simulado") Boolean simulado, @Param("modo") ModoJanela modo, Pageable pageable);

    /** Janelas de um ensaio, da mais antiga para a mais nova. */
    @Query(value = """
            select j from Janela j
            join fetch j.dispositivo
            join fetch j.ensaio e
            where e.id = :ensaioId
            order by j.medidoEm asc
            """,
            countQuery = "select count(j) from Janela j where j.ensaio.id = :ensaioId")
    Page<Janela> doEnsaio(@Param("ensaioId") Long ensaioId, Pageable pageable);

    @Query("select j from Janela j join fetch j.dispositivo left join fetch j.ensaio where j.id = :id")
    Optional<Janela> comDispositivoEEnsaio(@Param("id") Long id);

    @Query("""
            select count(j) as janelas,
                   coalesce(sum(case when j.saturou = true then 1 else 0 end), 0) as saturadas,
                   avg(j.rotacaoRpm) as rotacaoMedia,
                   min(j.medidoEm) as primeira,
                   max(j.medidoEm) as ultima
            from Janela j where j.ensaio.id = :ensaioId
            """)
    ResumoJanelas resumoDoEnsaio(@Param("ensaioId") Long ensaioId);

    interface ResumoJanelas {
        Long getJanelas();

        Number getSaturadas();

        Double getRotacaoMedia();

        Instant getPrimeira();

        Instant getUltima();
    }
}
