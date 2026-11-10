package br.senai.predictspin.telemetria;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeituraRepository extends JpaRepository<Leitura, Long> {

    @Query("select l from Leitura l join fetch l.canal c where l.janela.id = :janelaId order by c.codigo")
    List<Leitura> daJanela(@Param("janelaId") Long janelaId);
}
