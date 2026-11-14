package br.senai.predictspin.catalogo;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

/** O que os dois catálogos têm em comum. A consulta de busca fica em cada repositório. */
@NoRepositoryBean
public interface CatalogoRepository<T extends ItemCatalogo> extends JpaRepository<T, Long> {

    Optional<T> findByNomeNormalizado(String nomeNormalizado);

    /** Busca pelo nome normalizado contendo o termo (já normalizado); nulo = qualquer. */
    Page<T> buscar(String termo, Boolean ativo, Pageable pageable);
}
