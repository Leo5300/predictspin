package br.senai.predictspin.telemetria;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EnsaioRepository extends JpaRepository<Ensaio, Long> {

    @Query("""
            select e.id from Ensaio e
            where e.maquina.id = :maquinaId and e.encerradoEm is null and e.simulado = :simulado
            """)
    Optional<Long> idAberto(@Param("maquinaId") Long maquinaId, @Param("simulado") boolean simulado);

    @Query("select e from Ensaio e where e.maquina.id = :maquinaId and e.encerradoEm is null")
    Optional<Ensaio> aberto(@Param("maquinaId") Long maquinaId);

    @Query(value = "select nextval('ensaio_codigo_seq')", nativeQuery = true)
    long proximoNumero();

    @Query(value = """
            select e from Ensaio e
            where e.maquina.id = :maquinaId
              and (:etapa is null or e.etapa = :etapa)
              and (:condicao is null or e.condicao = :condicao)
              and (:simulado is null or e.simulado = :simulado)
              and (:descartado is null or e.descartado = :descartado)
              and (:aberto is null or (:aberto = true and e.encerradoEm is null)
                                   or (:aberto = false and e.encerradoEm is not null))
            order by e.iniciadoEm desc, e.id desc
            """,
            countQuery = """
            select count(e) from Ensaio e
            where e.maquina.id = :maquinaId
              and (:etapa is null or e.etapa = :etapa)
              and (:condicao is null or e.condicao = :condicao)
              and (:simulado is null or e.simulado = :simulado)
              and (:descartado is null or e.descartado = :descartado)
              and (:aberto is null or (:aberto = true and e.encerradoEm is null)
                                   or (:aberto = false and e.encerradoEm is not null))
            """)
    Page<Ensaio> filtrar(@Param("maquinaId") Long maquinaId, @Param("etapa") Etapa etapa,
                         @Param("condicao") Condicao condicao, @Param("simulado") Boolean simulado,
                         @Param("descartado") Boolean descartado, @Param("aberto") Boolean aberto,
                         Pageable pageable);

    /** Ensaios válidos (encerrados, não descartados, com janela) agrupados por etapa, condição e rotação. */
    @Query("""
            select e.etapa as etapa, e.condicao as condicao, e.rotacaoAlvoRpm as rotacaoAlvoRpm, count(e) as quantidade
            from Ensaio e
            where e.maquina.id = :maquinaId
              and e.descartado = false
              and e.encerradoEm is not null
              and (:simulado is null or e.simulado = :simulado)
              and exists (select 1 from Janela j where j.ensaio = e)
            group by e.etapa, e.condicao, e.rotacaoAlvoRpm
            """)
    List<LinhaCobertura> cobertura(@Param("maquinaId") Long maquinaId, @Param("simulado") Boolean simulado);

    @Query("""
            select distinct e.rotacaoAlvoRpm from Ensaio e
            where e.maquina.id = :maquinaId and (:simulado is null or e.simulado = :simulado)
            """)
    List<Integer> rotacoesUsadas(@Param("maquinaId") Long maquinaId, @Param("simulado") Boolean simulado);

    interface LinhaCobertura {
        Etapa getEtapa();

        Condicao getCondicao();

        Integer getRotacaoAlvoRpm();

        Long getQuantidade();
    }
}
