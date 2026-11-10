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
}
