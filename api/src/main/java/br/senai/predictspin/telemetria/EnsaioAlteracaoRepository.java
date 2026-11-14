package br.senai.predictspin.telemetria;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EnsaioAlteracaoRepository extends JpaRepository<EnsaioAlteracao, Long> {

    /** Alterações com o nome de quem alterou (nulo se o usuário não existir mais). */
    @Query(value = """
            select a.id as id, a.campo as campo, a.valorAntigo as valorAntigo, a.valorNovo as valorNovo,
                   a.alteradoPor as alteradoPor, u.nome as alteradoPorNome, a.alteradoEm as alteradoEm
            from EnsaioAlteracao a left join Usuario u on u.id = a.alteradoPor
            where a.ensaio.id = :ensaioId
            order by a.alteradoEm, a.id
            """,
            countQuery = "select count(a) from EnsaioAlteracao a where a.ensaio.id = :ensaioId")
    Page<Linha> doEnsaio(@Param("ensaioId") Long ensaioId, Pageable pageable);

    interface Linha {
        Long getId();

        String getCampo();

        String getValorAntigo();

        String getValorNovo();

        Long getAlteradoPor();

        String getAlteradoPorNome();

        java.time.Instant getAlteradoEm();
    }
}
