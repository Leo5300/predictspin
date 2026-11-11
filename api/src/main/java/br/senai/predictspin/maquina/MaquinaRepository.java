package br.senai.predictspin.maquina;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MaquinaRepository extends JpaRepository<Maquina, Long> {

    @Query(value = "select m from Maquina m join fetch m.local order by m.codigo",
            countQuery = "select count(m) from Maquina m")
    Page<Maquina> listarComLocal(Pageable pageable);

    Optional<Maquina> findByCodigo(String codigo);

    /** Prazo do modo rápido da máquina; vazio se nunca foi ligado ou foi desligado. */
    @Query("select m.modoRapidoAte from Maquina m where m.id = :id")
    Optional<Instant> modoRapidoAte(@Param("id") Long id);

    /** Grava o prazo do modo rápido (nulo desliga). Devolve 0 se a máquina não existe. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Maquina m set m.modoRapidoAte = :ate where m.id = :id")
    int definirModoRapido(@Param("id") Long id, @Param("ate") Instant ate);
}
