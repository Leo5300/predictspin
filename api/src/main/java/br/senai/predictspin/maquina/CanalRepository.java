package br.senai.predictspin.maquina;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import br.senai.predictspin.comum.CodigoId;

public interface CanalRepository extends JpaRepository<Canal, Long> {

    @Query("select c.codigo as codigo, c.id as id from Canal c where c.maquina.id = :maquinaId and c.ativo = true")
    List<CodigoId> codigosAtivos(@Param("maquinaId") Long maquinaId);

    @Query("""
            select distinct c.codigo from Canal c
            where (:maquinaId is null or c.maquina.id = :maquinaId)
            order by c.codigo
            """)
    List<String> codigos(@Param("maquinaId") Long maquinaId);
}
