package br.senai.predictspin.maquina;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import br.senai.predictspin.comum.CodigoId;

public interface PontoMedicaoRepository extends JpaRepository<PontoMedicao, Long> {

    @Query(value = "select p from PontoMedicao p where p.maquina.id = :maquinaId order by p.codigo",
            countQuery = "select count(p) from PontoMedicao p where p.maquina.id = :maquinaId")
    Page<PontoMedicao> listarPorMaquina(@Param("maquinaId") Long maquinaId, Pageable pageable);

    @Query("select p.codigo as codigo, p.id as id from PontoMedicao p where p.maquina.id = :maquinaId and p.ativo = true")
    List<CodigoId> codigosAtivos(@Param("maquinaId") Long maquinaId);
}
