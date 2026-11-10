package br.senai.predictspin.telemetria;

import java.util.List;

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

        java.time.Instant getPrimeira();

        java.time.Instant getUltima();
    }
}
