package br.senai.predictspin.seguranca;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);

    @Query(value = "select u from Usuario u order by u.nome, u.id",
            countQuery = "select count(u) from Usuario u")
    Page<Usuario> listar(Pageable pageable);
}
