package br.senai.predictspin.catalogo;

import java.time.Clock;

import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.catalogo.dto.AlteracaoItemCatalogoRequisicao;
import br.senai.predictspin.catalogo.dto.ItemCatalogoResposta;
import br.senai.predictspin.catalogo.dto.NovoItemCatalogoRequisicao;

/**
 * Regras dos catálogos de material e ferramenta:
 * <ul>
 *   <li>nome único pelo nome normalizado: criar ou renomear para um nome que já existe responde 409
 *       com o item existente;</li>
 *   <li>começam vazios; itens nascem pelo painel ou pelo texto de material de um ensaio;</li>
 *   <li>desativar esconde da escolha (os ensaios que já apontam para o item continuam).</li>
 * </ul>
 */
@Service
public class CatalogoService {

    private final MaterialRepository materiais;
    private final FerramentaRepository ferramentas;
    private final Clock relogio;

    public CatalogoService(MaterialRepository materiais, FerramentaRepository ferramentas, Clock relogio) {
        this.materiais = materiais;
        this.ferramentas = ferramentas;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public Pagina<ItemCatalogoResposta> listar(TipoCatalogo tipo, String busca, Boolean ativo, Pageable pageable) {
        String termo = NomeNormalizado.de(busca);
        return Pagina.de(repositorio(tipo).buscar(termo.isEmpty() ? null : termo, ativo, pageable),
                ItemCatalogoResposta::de);
    }

    @Transactional
    public ItemCatalogoResposta criar(TipoCatalogo tipo, NovoItemCatalogoRequisicao req, Long usuarioId) {
        String normalizado = exigirNome(req.nome());
        repositorio(tipo).findByNomeNormalizado(normalizado).ifPresent(existente -> {
            throw duplicado(tipo, existente);
        });
        ItemCatalogo novo = tipo == TipoCatalogo.MATERIAL
                ? new Material(req.nome(), vazioParaNulo(req.descricao()), usuarioId, relogio.instant())
                : new Ferramenta(req.nome(), vazioParaNulo(req.descricao()), usuarioId, relogio.instant());
        return ItemCatalogoResposta.de(salvar(tipo, novo));
    }

    @Transactional
    public ItemCatalogoResposta alterar(TipoCatalogo tipo, Long id, AlteracaoItemCatalogoRequisicao req) {
        ItemCatalogo item = exigir(tipo, id);
        if (req.nome() != null) {
            String normalizado = exigirNome(req.nome());
            repositorio(tipo).findByNomeNormalizado(normalizado)
                    .filter(outro -> !outro.getId().equals(id))
                    .ifPresent(outro -> {
                        throw duplicado(tipo, outro);
                    });
            item.renomear(req.nome());
        }
        if (req.descricao() != null) {
            item.descrever(vazioParaNulo(req.descricao()));
        }
        return ItemCatalogoResposta.de(item);
    }

    @Transactional
    public ItemCatalogoResposta desativar(TipoCatalogo tipo, Long id) {
        ItemCatalogo item = exigir(tipo, id);
        item.desativar();
        return ItemCatalogoResposta.de(item);
    }

    /** Material pelo texto livre de um ensaio: o existente pelo nome normalizado ou um novo. */
    @Transactional
    public Material materialPorNome(String nome, Long usuarioId) {
        String normalizado = exigirNome(nome);
        return materiais.findByNomeNormalizado(normalizado)
                .orElseGet(() -> materiais.saveAndFlush(new Material(nome, null, usuarioId, relogio.instant())));
    }

    @Transactional(readOnly = true)
    public Material material(Long id) {
        return (Material) exigirAtivo(TipoCatalogo.MATERIAL, id);
    }

    @Transactional(readOnly = true)
    public Ferramenta ferramenta(Long id) {
        return (Ferramenta) exigirAtivo(TipoCatalogo.FERRAMENTA, id);
    }

    private ItemCatalogo exigirAtivo(TipoCatalogo tipo, Long id) {
        ItemCatalogo item = exigir(tipo, id);
        if (!item.isAtivo()) {
            throw new RequisicaoInvalidaException(tipo.rotulo() + " " + id + " está desativado");
        }
        return item;
    }

    private ItemCatalogo exigir(TipoCatalogo tipo, Long id) {
        return repositorio(tipo).findById(id).map(ItemCatalogo.class::cast)
                .orElseThrow(() -> new RecursoNaoEncontradoException(tipo.rotulo() + " " + id + " não encontrado"));
    }

    @SuppressWarnings("unchecked")
    private CatalogoRepository<ItemCatalogo> repositorio(TipoCatalogo tipo) {
        return (CatalogoRepository<ItemCatalogo>) (CatalogoRepository<?>)
                (tipo == TipoCatalogo.MATERIAL ? materiais : ferramentas);
    }

    private ItemCatalogo salvar(TipoCatalogo tipo, ItemCatalogo item) {
        // flush imediato: dois pedidos iguais ao mesmo tempo esbarram no índice único aqui (409)
        return repositorio(tipo).saveAndFlush(item);
    }

    private static String exigirNome(String nome) {
        String normalizado = NomeNormalizado.de(nome);
        if (normalizado.isEmpty()) {
            throw new RequisicaoInvalidaException("O nome precisa ter ao menos uma letra ou número");
        }
        return normalizado;
    }

    private static ItemDuplicadoException duplicado(TipoCatalogo tipo, ItemCatalogo existente) {
        return new ItemDuplicadoException("Já existe no catálogo: \"" + existente.getNome() + "\"",
                ItemCatalogoResposta.de(existente));
    }

    private static String vazioParaNulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.trim();
    }
}
