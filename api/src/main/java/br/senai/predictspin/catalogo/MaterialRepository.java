package br.senai.predictspin.catalogo;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MaterialRepository extends CatalogoRepository<Material> {

    @Override
    @Query("""
            select m from Material m
            where (:termo is null or m.nomeNormalizado like concat('%', cast(:termo as string), '%'))
              and (:ativo is null or m.ativo = :ativo)
            order by m.nomeNormalizado
            """)
    Page<Material> buscar(@Param("termo") String termo, @Param("ativo") Boolean ativo, Pageable pageable);
}
