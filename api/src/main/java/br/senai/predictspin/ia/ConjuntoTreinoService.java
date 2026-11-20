package br.senai.predictspin.ia;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.alarme.AvaliacaoRepository;
import br.senai.predictspin.alarme.PropriedadesAlarme;
import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.comum.RequisicaoInvalidaException;
import br.senai.predictspin.ia.ConjuntoTreinoRepository.Candidata;
import br.senai.predictspin.ia.ConjuntoTreinoRepository.DadosJanela;
import br.senai.predictspin.ia.dto.LinhaConjuntoResposta;
import br.senai.predictspin.ia.dto.ResumoConjuntoResposta;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaAtiva;
import br.senai.predictspin.referencia.ReferenciaService;

/**
 * Conjunto de treino para o serviço de treino (ou o comando no notebook): só janelas rotuladas, com o vetor
 * calculado aqui ({@link VetorCaracteristicas}) contra a referência em uso. Paginado, para não carregar o
 * conjunto inteiro na memória da instância pequena.
 */
@Service
public class ConjuntoTreinoService {

    private final ConjuntoTreinoRepository repositorio;
    private final AvaliacaoRepository avaliacoes;
    private final ReferenciaService referencias;
    private final MaquinaRepository maquinas;
    private final PropriedadesReferencia propRef;
    private final PropriedadesTreino treino;
    private final PropriedadesModelo modelo;
    private final PropriedadesFusao fusao;
    private final PropriedadesAlarme alarme;

    public ConjuntoTreinoService(ConjuntoTreinoRepository repositorio, AvaliacaoRepository avaliacoes,
                                 ReferenciaService referencias, MaquinaRepository maquinas,
                                 PropriedadesReferencia propRef, PropriedadesTreino treino, PropriedadesModelo modelo,
                                 PropriedadesFusao fusao, PropriedadesAlarme alarme) {
        this.alarme = alarme;
        this.repositorio = repositorio;
        this.avaliacoes = avaliacoes;
        this.referencias = referencias;
        this.maquinas = maquinas;
        this.propRef = propRef;
        this.treino = treino;
        this.modelo = modelo;
        this.fusao = fusao;
    }

    @Transactional(readOnly = true)
    public ResumoConjuntoResposta resumo(long maquinaId, boolean simulado) {
        exigirMaquina(maquinaId);
        Optional<ReferenciaAtiva> ref = referencias.ativa(maquinaId, simulado);
        List<String> canais = fusao.habilitados();
        return new ResumoConjuntoResposta(maquinaId, simulado, VetorCaracteristicas.VERSAO,
                ref.map(ReferenciaAtiva::numero).orElse(null), ref.map(ReferenciaAtiva::versaoId).orElse(null),
                VetorCaracteristicas.nomes(canais), canais, ConjuntoTreinoRepository.CLASSES,
                repositorio.contar(maquinaId, simulado, treino.usarRetornoOs()), alarme.zAtencao(), modelo,
                treino.publicas());
    }

    @Transactional(readOnly = true)
    public Pagina<LinhaConjuntoResposta> pagina(long maquinaId, boolean simulado, int pagina, int tamanho) {
        exigirMaquina(maquinaId);
        if (pagina < 0 || tamanho < 1 || tamanho > treino.paginaMax()) {
            throw new RequisicaoInvalidaException("pagina >= 0 e tamanho de 1 a " + treino.paginaMax());
        }
        boolean usarOs = treino.usarRetornoOs();
        long total = repositorio.contar(maquinaId, simulado, usarOs);
        List<Candidata> candidatas = repositorio.pagina(maquinaId, simulado, usarOs, pagina, tamanho);
        Map<Long, DadosJanela> dados = repositorio.dados(candidatas.stream().map(Candidata::janelaId).toList());
        Map<String, Long> pontos = repositorio.pontos(maquinaId);
        List<Integer> marchas = avaliacoes.marchas(maquinaId);
        ReferenciaAtiva ref = referencias.ativa(maquinaId, simulado).orElse(null);
        List<String> canais = fusao.habilitados();
        ZoneId fuso = ZoneId.of(treino.fuso());

        List<LinhaConjuntoResposta> linhas = new ArrayList<>(candidatas.size());
        for (Candidata c : candidatas) {
            String grupo = c.ensaioId() != null ? "ensaio-" + c.ensaioId() : "os-" + c.osId();
            List<Double> valores = null;
            String motivo;
            if (c.eventoMarcado()) {
                motivo = "evento_marcado";
            } else {
                DadosJanela d = dados.get(c.janelaId());
                VetorCaracteristicas.Resultado r = VetorCaracteristicas.montar(new VetorCaracteristicas.Janela(
                        d.rotacaoRpm(), d.saturou(), d.modo(), d.amostras(), d.amostrasEsperadas(), d.calibracaoJson(),
                        c.etapa(), false, pontos, d.linhas(), d.canais()), ref, marchas, propRef, canais);
                motivo = r.motivo();
                if (r.temVetor()) {
                    valores = new ArrayList<>(r.valores().length);
                    for (double v : r.valores()) {
                        valores.add(Double.isNaN(v) ? null : v);
                    }
                }
            }
            linhas.add(new LinhaConjuntoResposta(c.janelaId(), c.medidoEm(), c.medidoEm().atZone(fuso).toLocalDate(),
                    c.rotulo(), c.origem(), c.ensaioId(), grupo, valores, motivo));
        }
        return new Pagina<>(linhas, pagina, tamanho, total, (int) ((total + tamanho - 1) / tamanho));
    }

    private void exigirMaquina(long maquinaId) {
        if (!maquinas.existsById(maquinaId)) {
            throw new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada");
        }
    }
}
