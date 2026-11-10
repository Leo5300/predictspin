package br.senai.predictspin.maquina;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MaquinaRepository extends JpaRepository<Maquina, Long> {

    @Query(value = "select m from Maquina m join fetch m.local order by m.codigo",
            countQuery = "select count(m) from Maquina m")
    Page<Maquina> listarComLocal(Pageable pageable);

    Optional<Maquina> findByCodigo(String codigo);
}
