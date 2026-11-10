package br.senai.predictspin.telemetria;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EnsaioRepository extends JpaRepository<Ensaio, Long> {

    @Query("""
            select e.id from Ensaio e
            where e.maquina.id = :maquinaId and e.encerradoEm is null and e.simulado = :simulado
            """)
    Optional<Long> idAberto(@Param("maquinaId") Long maquinaId, @Param("simulado") boolean simulado);
}
