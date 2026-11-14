package br.senai.predictspin.telemetria;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventoMarcadoRepository extends JpaRepository<EventoMarcado, Long> {

    @Query("""
            select e from EventoMarcado e
            where e.ensaio.id = :ensaioId
            order by e.ocorridoEm, e.id
            """)
    Page<EventoMarcado> doEnsaio(@Param("ensaioId") Long ensaioId, Pageable pageable);

    long countByEnsaioId(Long ensaioId);
}
