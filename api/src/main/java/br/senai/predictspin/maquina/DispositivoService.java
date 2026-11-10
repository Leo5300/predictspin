package br.senai.predictspin.maquina;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.seguranca.DispositivoAutenticado;
import br.senai.predictspin.seguranca.HashChaveDispositivo;

@Service
public class DispositivoService {

    private final DispositivoRepository dispositivos;
    private final MaquinaRepository maquinas;
    private final HashChaveDispositivo hash;

    public DispositivoService(DispositivoRepository dispositivos, MaquinaRepository maquinas, HashChaveDispositivo hash) {
        this.dispositivos = dispositivos;
        this.maquinas = maquinas;
        this.hash = hash;
    }

    /** Usado na carga inicial: cria o dispositivo só se o identificador ainda não existir. */
    @Transactional
    public boolean criarSeNaoExistir(String identificador, String codigoMaquina, String chave, boolean simulado) {
        if (dispositivos.existsByIdentificador(identificador)) {
            return false;
        }
        Maquina maquina = maquinas.findByCodigo(codigoMaquina)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Máquina " + codigoMaquina + " não encontrada"));
        dispositivos.save(new Dispositivo(maquina, identificador, hash.calcular(chave), simulado));
        return true;
    }

    /** Confere identificador e chave. Dispositivo inexistente, inativo ou com chave errada: vazio. */
    @Transactional(readOnly = true)
    public Optional<DispositivoAutenticado> autenticar(String identificador, String chave) {
        if (identificador == null || identificador.isBlank() || chave == null || chave.isBlank()) {
            return Optional.empty();
        }
        return dispositivos.buscarPorIdentificador(identificador.trim())
                .filter(Dispositivo::isAtivo)
                .filter(d -> hash.confere(chave, d.getCredencialHash()))
                .map(d -> new DispositivoAutenticado(d.getId(), d.getIdentificador(), d.getMaquina().getId(),
                        d.isSimulado()));
    }
}
