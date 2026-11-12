package br.senai.predictspin.maquina;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.Pagina;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.dto.DispositivoResposta;
import br.senai.predictspin.maquina.dto.MaquinaResposta;
import br.senai.predictspin.maquina.dto.PontoResposta;

@Service
@Transactional(readOnly = true)
public class MaquinaService {

    private final MaquinaRepository maquinas;
    private final PontoMedicaoRepository pontos;
    private final DispositivoRepository dispositivos;

    public MaquinaService(MaquinaRepository maquinas, PontoMedicaoRepository pontos, DispositivoRepository dispositivos) {
        this.maquinas = maquinas;
        this.pontos = pontos;
        this.dispositivos = dispositivos;
    }

    public Pagina<MaquinaResposta> listar(Pageable pageable) {
        return Pagina.de(maquinas.listarComLocal(pageable), MaquinaResposta::de);
    }

    public MaquinaResposta buscar(Long maquinaId) {
        return MaquinaResposta.de(exigirComLocal(maquinaId));
    }

    /** Grava as rotações da grade de cobertura (plano de coleta). Lista vazia limpa o plano. */
    @Transactional
    public MaquinaResposta definirPlanoDeColeta(Long maquinaId, List<Integer> rotacoes) {
        Maquina maquina = exigirComLocal(maquinaId);
        maquina.definirRotacoesColeta(rotacoes);
        return MaquinaResposta.de(maquina);
    }

    public Pagina<PontoResposta> listarPontos(Long maquinaId, Pageable pageable) {
        exigirMaquina(maquinaId);
        return Pagina.de(pontos.listarPorMaquina(maquinaId, pageable), PontoResposta::de);
    }

    public Pagina<DispositivoResposta> listarDispositivos(Long maquinaId, Boolean simulado, Pageable pageable) {
        exigirMaquina(maquinaId);
        return Pagina.de(dispositivos.listarPorMaquina(maquinaId, simulado, pageable), DispositivoResposta::de);
    }

    private Maquina exigirComLocal(Long maquinaId) {
        return maquinas.buscarComLocal(maquinaId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada"));
    }

    public Maquina exigirMaquina(Long maquinaId) {
        return maquinas.findById(maquinaId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Máquina " + maquinaId + " não encontrada"));
    }
}
