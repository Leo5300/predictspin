package br.senai.predictspin.catalogo;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FerramentaRepository extends CatalogoRepository<Ferramenta> {

    @Override
    @Query("""
            select f from Ferramenta f
            where (:termo is null or f.nomeNormalizado like concat('%', cast(:termo as string), '%'))
              and (:ativo is null or f.ativo = :ativo)
            order by f.nomeNormalizado
            """)
    Page<Ferramenta> buscar(@Param("termo") String termo, @Param("ativo") Boolean ativo, Pageable pageable);
}
