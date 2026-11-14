package br.senai.predictspin.telemetria;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.catalogo.CatalogoService;
import br.senai.predictspin.catalogo.Ferramenta;
import br.senai.predictspin.catalogo.Material;
import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.telemetria.dto.AlteracaoEnsaioResposta;
import br.senai.predictspin.telemetria.dto.EnsaioResposta;
import br.senai.predictspin.telemetria.dto.EventoMarcadoResposta;
import br.senai.predictspin.telemetria.dto.NovoEventoMarcadoRequisicao;
import br.senai.predictspin.telemetria.dto.ReceitaRequisicao;

/**
 * Receita do corte depois da gravação e eventos marcados durante a gravação.
 * <ul>
 *   <li>Corrigir a receita muda só os campos da receita e a observação; etapa, condição, rotação alvo,
 *       simulado e período definem a célula da cobertura e a classe, e não mudam (400). Cada campo
 *       que muda vira uma linha no histórico (campo, valor antigo, valor novo, quem, quando).</li>
 *   <li>Evento marcado só com o ensaio aberto (encerrado: 409). O instante é o do toque no painel,
 *       que pode ter acontecido alguns segundos antes do pedido.</li>
 * </ul>
 */
@Service
public class ReceitaService {

    /** Campos que a correção aceita (nomes do JSON). */
    static final Set<String> CAMPOS_DA_RECEITA = Set.of("material_id", "ferramenta_id", "avanco_alvo",
            "profundidade_corte_mm", "diametro_peca_mm", "fluido_corte", "observacao");

    /** Tolerância para o relógio do celular adiantado em relação ao servidor. */
    static final Duration FUTURO_TOLERADO = Duration.ofMinutes(2);

    private final EnsaioRepository ensaios;
    private final EnsaioAlteracaoRepository alteracoes;
    private final EventoMarcadoRepository eventos;
    private final CatalogoService catalogo;
    private final ObjectMapper json;
    private final Validator validador;
    private final ApplicationEventPublisher anuncios;
    private final Clock relogio;

    public ReceitaService(EnsaioRepository ensaios, EnsaioAlteracaoRepository alteracoes,
                          EventoMarcadoRepository eventos, CatalogoService catalogo, ObjectMapper json,
                          Validator validador, ApplicationEventPublisher anuncios, Clock relogio) {
        this.ensaios = ensaios;
        this.alteracoes = alteracoes;
        this.eventos = eventos;
        this.catalogo = catalogo;
        this.json = json;
        this.validador = validador;
        this.anuncios = anuncios;
        this.relogio = relogio;
    }

    /** Corrige a receita: só os campos presentes no corpo mudam; nulo apaga o campo. */
    @Transactional
    public EnsaioResposta corrigir(Long ensaioId, JsonNode corpo, Long usuarioId) {
        if (corpo == null || !corpo.isObject() || corpo.isEmpty()) {
            throw new RequisicaoInvalidaException("Informe ao menos um campo da receita");
        }
        List<String> proibidos = new ArrayList<>();
        for (Iterator<String> nomes = corpo.fieldNames(); nomes.hasNext(); ) {
            String nome = nomes.next();
            if (!CAMPOS_DA_RECEITA.contains(nome)) {
                proibidos.add(nome);
            }
        }
        if (!proibidos.isEmpty()) {
            throw new RequisicaoInvalidaException("Só a receita e a observação podem ser corrigidas. Não mudam: "
                    + String.join(", ", proibidos) + " (etapa, condição, rotação alvo, simulado e período definem "
                    + "a célula da cobertura e a classe)");
        }
        ReceitaRequisicao receita = ler(corpo);
        Set<ConstraintViolation<ReceitaRequisicao>> violacoes = validador.validate(receita);
        if (!violacoes.isEmpty()) {
            throw new ConstraintViolationException(new LinkedHashSet<>(violacoes));
        }

        Ensaio ensaio = exigir(ensaioId);
        Instant agora = relogio.instant();
        List<EnsaioAlteracao> novas = new ArrayList<>();
        if (corpo.has("material_id")) {
            Material novo = receita.materialId() == null ? null : catalogo.material(receita.materialId());
            registrar(novas, ensaio, "material", nomeDoMaterial(ensaio), novo == null ? null : novo.getNome(),
                    usuarioId, agora);
            ensaio.definirMaterial(novo);
        }
        if (corpo.has("ferramenta_id")) {
            Ferramenta nova = receita.ferramentaId() == null ? null : catalogo.ferramenta(receita.ferramentaId());
            registrar(novas, ensaio, "ferramenta", ensaio.getFerramenta() == null ? null
                    : ensaio.getFerramenta().getNome(), nova == null ? null : nova.getNome(), usuarioId, agora);
            ensaio.definirFerramenta(nova);
        }
        if (corpo.has("avanco_alvo")) {
            registrar(novas, ensaio, "avanco_alvo", texto(ensaio.getAvancoAlvo()), texto(receita.avancoAlvo()),
                    usuarioId, agora);
            ensaio.definirAvancoAlvo(receita.avancoAlvo());
        }
        if (corpo.has("profundidade_corte_mm")) {
            registrar(novas, ensaio, "profundidade_corte_mm", texto(ensaio.getProfundidadeCorteMm()),
                    texto(receita.profundidadeCorteMm()), usuarioId, agora);
            ensaio.definirProfundidadeCorteMm(receita.profundidadeCorteMm());
        }
        if (corpo.has("diametro_peca_mm")) {
            registrar(novas, ensaio, "diametro_peca_mm", texto(ensaio.getDiametroPecaMm()),
                    texto(receita.diametroPecaMm()), usuarioId, agora);
            ensaio.definirDiametroPecaMm(receita.diametroPecaMm());
        }
        if (corpo.has("fluido_corte")) {
            registrar(novas, ensaio, "fluido_corte", ensaio.getFluidoCorte() == null ? null
                    : ensaio.getFluidoCorte().valor(), receita.fluidoCorte() == null ? null
                    : receita.fluidoCorte().valor(), usuarioId, agora);
            ensaio.definirFluidoCorte(receita.fluidoCorte());
        }
        if (corpo.has("observacao")) {
            String nova = vazioParaNulo(receita.observacao());
            registrar(novas, ensaio, "observacao", ensaio.getObservacao(), nova, usuarioId, agora);
            ensaio.definirObservacao(nova);
        }
        alteracoes.saveAll(novas);
        return EnsaioResposta.de(ensaio);
    }

    @Transactional(readOnly = true)
    public Pagina<AlteracaoEnsaioResposta> alteracoes(Long ensaioId, Pageable pageable) {
        exigir(ensaioId);
        return Pagina.de(alteracoes.doEnsaio(ensaioId, pageable), AlteracaoEnsaioResposta::de);
    }

    @Transactional
    public EventoMarcadoResposta marcar(Long ensaioId, NovoEventoMarcadoRequisicao req, Long usuarioId) {
        Ensaio ensaio = exigir(ensaioId);
        if (!ensaio.isAberto()) {
            throw new ConflitoException("O ensaio " + ensaio.getCodigo() + " já está encerrado: eventos só são "
                    + "marcados durante a gravação");
        }
        Instant agora = relogio.instant();
        Instant ocorrido = req.ocorridoEm() == null ? agora : req.ocorridoEm();
        if (ocorrido.isAfter(agora.plus(FUTURO_TOLERADO))) {
            throw new RequisicaoInvalidaException("O instante do evento está no futuro");
        }
        if (ocorrido.isBefore(ensaio.getIniciadoEm())) {
            throw new RequisicaoInvalidaException("O instante do evento é anterior ao início do ensaio");
        }
        EventoMarcado evento = eventos.save(new EventoMarcado(ensaio, ocorrido, req.motivo(),
                vazioParaNulo(req.nota()), usuarioId, agora));
        EventoMarcadoResposta resposta = EventoMarcadoResposta.de(evento);
        anuncios.publishEvent(new EventoMarcadoGravado(ensaio.getMaquina().getId(), ensaio.isSimulado(), resposta));
        return resposta;
    }

    @Transactional(readOnly = true)
    public Pagina<EventoMarcadoResposta> eventos(Long ensaioId, Pageable pageable) {
        exigir(ensaioId);
        return Pagina.de(eventos.doEnsaio(ensaioId, pageable), EventoMarcadoResposta::de);
    }

    private ReceitaRequisicao ler(JsonNode corpo) {
        try {
            return json.treeToValue(corpo, ReceitaRequisicao.class);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new RequisicaoInvalidaException("Valor inválido na receita: " + mensagemLegivel(e));
        }
    }

    private static String mensagemLegivel(Exception e) {
        Throwable causa = e;
        while (causa != null) {
            if (causa instanceof IllegalArgumentException && causa.getMessage() != null
                    && causa.getMessage().startsWith("Valor '")) {
                return causa.getMessage();
            }
            causa = causa.getCause();
        }
        return "confira os tipos dos campos";
    }

    private static void registrar(List<EnsaioAlteracao> lista, Ensaio ensaio, String campo, String antigo,
                                  String novo, Long usuarioId, Instant agora) {
        if (!Objects.equals(antigo, novo)) {
            lista.add(new EnsaioAlteracao(ensaio, campo, antigo, novo, usuarioId, agora));
        }
    }

    private static String nomeDoMaterial(Ensaio ensaio) {
        return ensaio.getMaterialItem() != null ? ensaio.getMaterialItem().getNome() : ensaio.getMaterial();
    }

    /** Número sem zeros à direita ("0.150" e "0.15" são o mesmo valor no histórico). */
    private static String texto(BigDecimal valor) {
        return valor == null ? null : valor.stripTrailingZeros().toPlainString();
    }

    private Ensaio exigir(Long ensaioId) {
        return ensaios.findById(ensaioId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Ensaio " + ensaioId + " não encontrado"));
    }

    private static String vazioParaNulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.trim();
    }
}
