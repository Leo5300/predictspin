package br.senai.predictspin.maquina;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DispositivoRepository extends JpaRepository<Dispositivo, Long> {

    @Query("select d from Dispositivo d join fetch d.maquina where d.identificador = :identificador")
    Optional<Dispositivo> buscarPorIdentificador(@Param("identificador") String identificador);

    boolean existsByIdentificador(String identificador);

    @Query(value = """
            select d from Dispositivo d
            where d.maquina.id = :maquinaId
              and (:simulado is null or d.simulado = :simulado)
            order by d.identificador
            """,
            countQuery = """
            select count(d) from Dispositivo d
            where d.maquina.id = :maquinaId
              and (:simulado is null or d.simulado = :simulado)
            """)
    Page<Dispositivo> listarPorMaquina(@Param("maquinaId") Long maquinaId,
                                       @Param("simulado") Boolean simulado,
                                       Pageable pageable);

    @Query("select count(d) from Dispositivo d where d.maquina.id = :maquinaId and d.ativo = true")
    long contarAtivos(@Param("maquinaId") Long maquinaId);

    @Query("select count(d) from Dispositivo d where d.maquina.id = :maquinaId and d.ativo = true and d.simulado = false")
    long contarReaisAtivos(@Param("maquinaId") Long maquinaId);

    /**
     * Grava o último contato só se o valor guardado for anterior a {@code limite} (ou nulo). Assim a
     * linha do dispositivo é travada no máximo uma vez por intervalo, e não em toda janela recebida.
     *
     * @return 1 se gravou, 0 se o contato guardado já era recente
     */
    @Modifying
    @Query("""
            update Dispositivo d set d.ultimoContato = :instante
            where d.id = :id and (d.ultimoContato is null or d.ultimoContato < :limite)
            """)
    int registrarContato(@Param("id") Long id, @Param("instante") Instant instante, @Param("limite") Instant limite);
}
