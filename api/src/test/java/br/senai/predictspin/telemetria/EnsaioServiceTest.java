package br.senai.predictspin.telemetria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import br.senai.predictspin.RelogioAjustavel;
import br.senai.predictspin.comum.ConflitoException;
import br.senai.predictspin.comum.RecursoNaoEncontradoException;
import br.senai.predictspin.maquina.DispositivoRepository;
import br.senai.predictspin.maquina.Maquina;
import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.telemetria.dto.CoberturaResposta;
import br.senai.predictspin.telemetria.dto.NovoEnsaioRequisicao;

class EnsaioServiceTest {

    private static final Instant INICIO = Instant.parse("2026-11-10T12:00:00Z");
    private static final long MAQUINA = 1L;

    private EnsaioRepository ensaios;
    private JanelaRepository janelas;
    private MaquinaRepository maquinas;
    private DispositivoRepository dispositivos;
    private RelogioAjustavel relogio;
    private Maquina torno;
    private EnsaioService servico;

    @BeforeEach
    void criar() {
        ensaios = mock(EnsaioRepository.class);
        janelas = mock(JanelaRepository.class);
        maquinas = mock(MaquinaRepository.class);
        dispositivos = mock(DispositivoRepository.class);
        relogio = new RelogioAjustavel(INICIO);
        torno = mock(Maquina.class);
        when(torno.getId()).thenReturn(MAQUINA);
        when(torno.getCodigo()).thenReturn("TORNO-01");
        when(maquinas.findById(MAQUINA)).thenReturn(Optional.of(torno));
        when(maquinas.existsById(MAQUINA)).thenReturn(true);
        when(ensaios.aberto(MAQUINA)).thenReturn(Optional.empty());
        when(ensaios.proximoNumero()).thenReturn(42L);
        when(ensaios.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
        when(dispositivos.contarAtivos(MAQUINA)).thenReturn(2L);
        when(dispositivos.contarReaisAtivos(MAQUINA)).thenReturn(1L);
        servico = new EnsaioService(ensaios, janelas, maquinas, dispositivos, relogio);
    }

    private static NovoEnsaioRequisicao pedido(Boolean simulado) {
        return new NovoEnsaioRequisicao(Etapa.T1, Condicao.NORMAL, 1200, "  aço SAE 1045 ", null,
                new BigDecimal("0.150"), "   ", simulado);
    }

    private Ensaio ensaio(boolean simulado) {
        return new Ensaio(torno, "TORNO-01-T1-00001", Etapa.T1, Condicao.NORMAL, null, 1200, null, 1, null,
                simulado, INICIO);
    }

    @Test
    void abreComCodigoGeradoERotulosNormalizados() {
        var resposta = servico.abrir(MAQUINA, pedido(null));

        assertThat(resposta.codigo()).isEqualTo("TORNO-01-T1-00042");
        assertThat(resposta.maquinaId()).isEqualTo(MAQUINA);
        assertThat(resposta.material()).isEqualTo("aço SAE 1045");
        assertThat(resposta.observacao()).isNull();
        assertThat(resposta.repeticao()).isEqualTo(1);
        assertThat(resposta.aberto()).isTrue();
        assertThat(resposta.descartado()).isFalse();
        assertThat(resposta.simulado()).isFalse();
        assertThat(resposta.iniciadoEm()).isEqualTo(INICIO);
    }

    @Test
    void ensaioEhSimuladoSePedidoOuSeSoHaDispositivoSimuladoAtivo() {
        assertThat(servico.abrir(MAQUINA, pedido(true)).simulado()).isTrue();

        when(dispositivos.contarReaisAtivos(MAQUINA)).thenReturn(0L);
        assertThat(servico.abrir(MAQUINA, pedido(null)).simulado()).isTrue();

        // máquina sem nenhum dispositivo ativo não vira simulada sozinha
        when(dispositivos.contarAtivos(MAQUINA)).thenReturn(0L);
        assertThat(servico.abrir(MAQUINA, pedido(false)).simulado()).isFalse();
    }

    @Test
    void segundoEnsaioAbertoNaMesmaMaquinaEhConflito() {
        when(ensaios.aberto(MAQUINA)).thenReturn(Optional.of(ensaio(false)));

        assertThatThrownBy(() -> servico.abrir(MAQUINA, pedido(null)))
                .isInstanceOf(ConflitoException.class)
                .hasMessageContaining("TORNO-01-T1-00001");
        verify(ensaios, never()).saveAndFlush(any());
        verify(ensaios, never()).proximoNumero();
    }

    @Test
    void abrirEmMaquinaInexistenteEh404() {
        when(maquinas.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> servico.abrir(99L, pedido(null))).isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void encerraUmaVezSo() {
        Ensaio e = ensaio(false);
        when(ensaios.findById(5L)).thenReturn(Optional.of(e));
        relogio.avancar(Duration.ofMinutes(3));

        var resposta = servico.encerrar(5L);

        assertThat(resposta.aberto()).isFalse();
        assertThat(resposta.encerradoEm()).isEqualTo(INICIO.plusSeconds(180));
        assertThatThrownBy(() -> servico.encerrar(5L)).isInstanceOf(ConflitoException.class);
    }

    @Test
    void descartarMarcaEncerraENaoApaga() {
        Ensaio e = ensaio(false);
        when(ensaios.findById(5L)).thenReturn(Optional.of(e));
        relogio.avancar(Duration.ofSeconds(30));

        var resposta = servico.descartar(5L);

        assertThat(resposta.descartado()).isTrue();
        assertThat(resposta.aberto()).isFalse();
        assertThat(resposta.encerradoEm()).isEqualTo(INICIO.plusSeconds(30));
        verify(ensaios, never()).delete(any());
        verify(ensaios, never()).deleteById(any());
        assertThatThrownBy(() -> servico.descartar(5L)).isInstanceOf(ConflitoException.class);
    }

    @Test
    void descartarEnsaioJaEncerradoPreservaOInstanteDoEncerramento() {
        Ensaio e = ensaio(false);
        e.encerrar(INICIO.plusSeconds(60));
        when(ensaios.findById(5L)).thenReturn(Optional.of(e));
        relogio.avancar(Duration.ofHours(1));

        assertThat(servico.descartar(5L).encerradoEm()).isEqualTo(INICIO.plusSeconds(60));
    }

    @Test
    void ensaioInexistenteEh404EmTodasAsOperacoes() {
        when(ensaios.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> servico.buscar(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.encerrar(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.descartar(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.resumo(9L)).isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void buscarDevolveOEnsaio() {
        when(ensaios.findById(5L)).thenReturn(Optional.of(ensaio(true)));
        assertThat(servico.buscar(5L).simulado()).isTrue();
    }

    @Test
    void listarRepassaOsFiltrosEPagina() {
        var pagina = PageRequest.of(1, 2);
        var filtro = new EnsaioService.Filtro(Etapa.T1, Condicao.NORMAL, true, false, null);
        when(ensaios.filtrar(MAQUINA, Etapa.T1, Condicao.NORMAL, true, false, null, pagina))
                .thenReturn(new PageImpl<>(List.of(ensaio(true)), pagina, 3));

        var resposta = servico.listar(MAQUINA, filtro, pagina);

        assertThat(resposta.conteudo()).hasSize(1);
        assertThat(resposta.pagina()).isEqualTo(1);
        assertThat(resposta.tamanho()).isEqualTo(2);
        assertThat(resposta.totalElementos()).isEqualTo(3);
        assertThat(resposta.totalPaginas()).isEqualTo(2);
    }

    @Test
    void listarECoberturaEmMaquinaInexistenteSao404() {
        when(maquinas.existsById(99L)).thenReturn(false);
        var filtro = new EnsaioService.Filtro(null, null, null, null, null);
        assertThatThrownBy(() -> servico.listar(99L, filtro, PageRequest.of(0, 10)))
                .isInstanceOf(RecursoNaoEncontradoException.class);
        assertThatThrownBy(() -> servico.cobertura(99L, null, 3, null))
                .isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void resumoDeEnsaioAbertoContaATeAgoraETrataAusenciaDeJanelas() {
        when(ensaios.findById(5L)).thenReturn(Optional.of(ensaio(false)));
        when(janelas.resumoDoEnsaio(5L)).thenReturn(resumo(null, null, null, null, null));
        relogio.avancar(Duration.ofSeconds(75));

        var resumo = servico.resumo(5L);

        assertThat(resumo.aberto()).isTrue();
        assertThat(resumo.duracaoSegundos()).isEqualTo(75);
        assertThat(resumo.janelas()).isZero();
        assertThat(resumo.janelasSaturadas()).isZero();
        assertThat(resumo.rotacaoMediaRpm()).isNull();
    }

    @Test
    void resumoDeEnsaioEncerradoUsaOEncerramento() {
        Ensaio e = ensaio(false);
        e.encerrar(INICIO.plusSeconds(120));
        when(ensaios.findById(5L)).thenReturn(Optional.of(e));
        when(janelas.resumoDoEnsaio(5L)).thenReturn(
                resumo(24L, 2, 1198.5, INICIO.plusSeconds(5), INICIO.plusSeconds(115)));
        relogio.avancar(Duration.ofHours(5));

        var resumo = servico.resumo(5L);

        assertThat(resumo.duracaoSegundos()).isEqualTo(120);
        assertThat(resumo.janelas()).isEqualTo(24);
        assertThat(resumo.janelasSaturadas()).isEqualTo(2);
        assertThat(resumo.rotacaoMediaRpm()).isEqualTo(1198.5);
        assertThat(resumo.primeiraMedicao()).isEqualTo(INICIO.plusSeconds(5));
        assertThat(resumo.ultimaMedicao()).isEqualTo(INICIO.plusSeconds(115));
    }

    @Test
    void coberturaMontaAGradeCompletaEContaOQueFalta() {
        when(ensaios.cobertura(MAQUINA, true)).thenReturn(List.of(
                linha(Etapa.T1, Condicao.NORMAL, 1200, 3L),
                linha(Etapa.T1, Condicao.NORMAL, 800, 1L),
                linha(Etapa.T2, Condicao.AVANCO_EXCESSIVO, 1200, 5L)));

        CoberturaResposta c = servico.cobertura(MAQUINA, true, 3, List.of(1200, 800, 1200));

        int combinacoes = Etapa.values().length * Condicao.values().length * 2;
        assertThat(c.rotacoesRpm()).containsExactly(800, 1200);
        assertThat(c.combinacoes()).isEqualTo(combinacoes);
        assertThat(c.itens()).hasSize(combinacoes);
        assertThat(c.combinacoesCompletas()).isEqualTo(2);
        assertThat(c.ensaiosValidos()).isEqualTo(9);
        // 2 completas, 1 faltando 2, as demais faltando 3
        assertThat(c.ensaiosFaltantes()).isEqualTo(2 + (combinacoes - 3) * 3L);
        assertThat(item(c, Etapa.T1, Condicao.NORMAL, 800).faltam()).isEqualTo(2);
        assertThat(item(c, Etapa.T2, Condicao.AVANCO_EXCESSIVO, 1200).faltam()).isZero();
        assertThat(item(c, Etapa.T0, Condicao.NORMAL, 800).ensaiosValidos()).isZero();
        verify(ensaios, never()).rotacoesUsadas(any(), any());
    }

    @Test
    void coberturaSemRotacoesInformadasUsaAsJaUsadasNaMaquina() {
        when(ensaios.rotacoesUsadas(MAQUINA, null)).thenReturn(List.of(1600, 400));
        when(ensaios.cobertura(MAQUINA, null)).thenReturn(List.of());

        CoberturaResposta c = servico.cobertura(MAQUINA, null, 1, List.of());

        assertThat(c.rotacoesRpm()).containsExactly(400, 1600);
        assertThat(c.combinacoesCompletas()).isZero();
        assertThat(c.ensaiosFaltantes()).isEqualTo(c.combinacoes());
    }

    private static CoberturaResposta.Item item(CoberturaResposta c, Etapa etapa, Condicao condicao, int rotacao) {
        return c.itens().stream()
                .filter(i -> i.etapa() == etapa && i.condicao() == condicao && i.rotacaoAlvoRpm() == rotacao)
                .findFirst().orElseThrow();
    }

    private static EnsaioRepository.LinhaCobertura linha(Etapa etapa, Condicao condicao, Integer rotacao, Long qtd) {
        return new EnsaioRepository.LinhaCobertura() {
            @Override
            public Etapa getEtapa() {
                return etapa;
            }

            @Override
            public Condicao getCondicao() {
                return condicao;
            }

            @Override
            public Integer getRotacaoAlvoRpm() {
                return rotacao;
            }

            @Override
            public Long getQuantidade() {
                return qtd;
            }
        };
    }

    private static JanelaRepository.ResumoJanelas resumo(Long janelas, Number saturadas, Double media,
                                                         Instant primeira, Instant ultima) {
        return new JanelaRepository.ResumoJanelas() {
            @Override
            public Long getJanelas() {
                return janelas;
            }

            @Override
            public Number getSaturadas() {
                return saturadas;
            }

            @Override
            public Double getRotacaoMedia() {
                return media;
            }

            @Override
            public Instant getPrimeira() {
                return primeira;
            }

            @Override
            public Instant getUltima() {
                return ultima;
            }
        };
    }
}
