package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import br.senai.predictspin.alarme.AvaliacaoRepository;
import br.senai.predictspin.ia.dto.MetadadosModelo;
import br.senai.predictspin.referencia.PropriedadesReferencia;
import br.senai.predictspin.referencia.ReferenciaService;
import br.senai.predictspin.telemetria.IngestaoRepository.LinhaTelemetria;
import br.senai.predictspin.telemetria.JanelaRecebida;
import br.senai.predictspin.telemetria.ModoJanela;

/** Segunda opinião sem banco: textos, classe incerta, só anomalia, incompatibilidades e erros de carga. */
class InferenciaServiceTest {

    static final ObjectMapper JSON = new ObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .registerModule(new JavaTimeModule());
    static final PropriedadesReferencia PROP_REF = VetorCaracteristicasTest.PROP;

    ModeloRepository repositorio;
    ReferenciaService referencias;
    MetadadosModelo meta;
    String metaJson;

    @BeforeEach
    void preparar() throws IOException {
        repositorio = mock(ModeloRepository.class);
        referencias = mock(ReferenciaService.class);
        metaJson = new String(MotorOnnxTest.ler("metadados.json"), java.nio.charset.StandardCharsets.UTF_8);
        meta = JSON.readValue(metaJson, MetadadosModelo.class);
    }

    private InferenciaService servico(double confiancaMin, PropriedadesFusao fusao) {
        AvaliacaoRepository avaliacoes = mock(AvaliacaoRepository.class);
        when(avaliacoes.marchas(anyLong())).thenReturn(List.of(450, 1120));
        return new InferenciaService(repositorio, referencias, avaliacoes, PROP_REF,
                new PropriedadesModelo(99, confiancaMin, 5, 100, 60, 10, 42, 3), fusao, JSON,
                mock(PlatformTransactionManager.class));
    }

    private static PropriedadesFusao semCanais() {
        return new PropriedadesFusao(Map.of("nivel_som_db", new PropriedadesFusao.Canal(false)));
    }

    private static ModeloRepository.Linha linha(String versaoVetor, String metadados) {
        return new ModeloRepository.Linha(9, 1, true, 3, "ativo", Instant.now(), "a", Instant.now(), "a", null,
                versaoVetor, 10L, 3, 0.5, metadados, "{}", 1000, true);
    }

    private InferenciaService.Carga carga(boolean comClasse) throws IOException {
        MotorModelo motor = new MotorOnnx(MotorOnnxTest.ler("anomalia.onnx"),
                comClasse ? MotorOnnxTest.ler("classe.onnx") : null, meta.offsetAnomalia(), 25);
        MetadadosModelo m = comClasse ? meta : JSON.readValue(semClasses(), MetadadosModelo.class);
        return new InferenciaService.Carga(linha("v1", metaJson), m, motor, null);
    }

    private String semClasses() throws IOException {
        ObjectNode n = (ObjectNode) JSON.readTree(metaJson);
        n.putArray("classes");
        return JSON.writeValueAsString(n);
    }

    /** Vetor com B em desvio (z alto no RMS, pico e curtose) e o resto típico. */
    private static VetorCaracteristicas.Resultado vetor(double zB) {
        Map<String, LinhaTelemetria> l = VetorCaracteristicasTest.tres(0.10, 0.10 + 0.01 * zB, 0.10, 0.10);
        return VetorCaracteristicas.montar(VetorCaracteristicasTest.janela(1120, ModoJanela.NORMAL, "T3", l, null),
                VetorCaracteristicasTest.referencia(null), List.of(1120), PROP_REF, List.of());
    }

    @Test
    void classeProvavelComConfiancaExplicacaoEVersao() throws IOException {
        var o = servico(0.0, semCanais()).opiniao(carga(true), vetor(6), 7, Instant.now());
        assertThat(o.classe()).isIn(meta.classes());
        assertThat(o.incerta()).isFalse();
        assertThat(o.explicacao()).startsWith("classe provável: ").endsWith(" · modelo v3");
        assertThat(o.concordancia()).startsWith("o modelo");
        assertThat(o.simulado()).isTrue();
    }

    @Test
    void confiancaAbaixoDoMinimoViraClasseIncerta() throws IOException {
        var o = servico(1.01, semCanais()).opiniao(carga(true), vetor(6), 7, Instant.now());
        assertThat(o.incerta()).isTrue();
        assertThat(o.explicacao()).startsWith("classe incerta (mais parecida: ");
    }

    @Test
    void semClassificadorDizSoAAnomalia() throws IOException {
        var normal = servico(0.6, semCanais()).opiniao(carga(false), vetor(0), 7, Instant.now());
        assertThat(normal.classe()).isNull();
        assertThat(normal.explicacao()).containsAnyOf("o modelo vê anomalia (escore ", "o modelo não vê anomalia (escore ");
        var desvio = servico(0.6, semCanais()).opiniao(carga(false), vetor(40), 7, Instant.now());
        assertThat(desvio.escore()).isGreaterThan(normal.escore());
    }

    @Test
    void caracteristicaAusenteFalha() throws IOException {
        VetorCaracteristicas.Resultado v = vetor(1);
        v.valores()[VetorCaracteristicas.posicoes(v.nomes()).get("z_A_vel_rms_mm_s")] = Double.NaN;
        InferenciaService s = servico(0.6, semCanais());
        InferenciaService.Carga c = carga(true);
        assertThatThrownBy(() -> s.opiniao(c, v, 7, Instant.now())).hasMessageContaining("ausente");
    }

    @Test
    void incompatibilidades() throws IOException {
        InferenciaService s = servico(0.6, semCanais());
        assertThat(s.incompatibilidade(linha("v0", metaJson), meta)).contains("versão do vetor");
        ObjectNode comCanal = (ObjectNode) JSON.readTree(metaJson);
        ((ArrayNode) comCanal.putArray("canais")).add("nivel_som_db");
        assertThat(s.incompatibilidade(linha("v1", metaJson), JSON.treeToValue(comCanal, MetadadosModelo.class)))
                .contains("nivel_som_db");
        ObjectNode estranha = (ObjectNode) JSON.readTree(metaJson);
        ((ArrayNode) estranha.get("caracteristicas")).add("canal_inexistente");
        assertThat(s.incompatibilidade(linha("v1", metaJson), JSON.treeToValue(estranha, MetadadosModelo.class)))
                .contains("canal_inexistente");
        assertThat(s.incompatibilidade(linha("v1", metaJson), meta)).isNull();
        // canal exigido e habilitado: passa pelo canal e confere as características
        InferenciaService comSom = servico(0.6,
                new PropriedadesFusao(Map.of("nivel_som_db", new PropriedadesFusao.Canal(true))));
        assertThat(comSom.incompatibilidade(linha("v1", metaJson), JSON.treeToValue(comCanal, MetadadosModelo.class)))
                .isNull();
    }

    @Test
    void cargaComMetadadosOuOnnxInvalidosNaoRodaEDizPorQue() throws IOException {
        InferenciaService s = servico(0.6, semCanais());
        when(repositorio.ativo(1, true)).thenReturn(Optional.of(linha("v1", "{quebrado")));
        assertThat(s.carga(1, true).orElseThrow().motivoNaoRoda()).startsWith("metadados ilegíveis");
        assertThat(s.carga(1, true).orElseThrow().roda()).isFalse();

        when(repositorio.ativo(2, true)).thenReturn(Optional.of(linha("v1", metaJson)));
        when(repositorio.arquivos(9)).thenReturn(new ModeloRepository.Arquivos(new byte[] {1}, null, null));
        assertThat(s.carga(2, true).orElseThrow().motivoNaoRoda()).contains("não foi possível carregar");
        assertThat(s.erros()).isEqualTo(1);
        assertThat(s.ultimoErro()).contains("carregando o modelo");

        when(repositorio.ativo(3, true)).thenReturn(Optional.of(linha("v0", metaJson)));
        assertThat(s.carga(3, true).orElseThrow().motivoNaoRoda()).contains("versão do vetor");
        when(repositorio.ativo(4, false)).thenReturn(Optional.empty());
        assertThat(s.carga(4, false)).isEmpty();
        s.recarregar(2, true);
        s.recarregar(99, true);
        s.esquecer();
    }

    @Test
    void opinarSemModeloSemReferenciaOuSemVetorNaoDaOpiniao() throws IOException {
        InferenciaService s = servico(0.6, semCanais());
        Map<String, Long> pontos = new HashMap<>(Map.of("A", 1L, "B", 2L, "C", 3L));
        List<LinhaTelemetria> linhas = List.of(new LinhaTelemetria(1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1),
                new LinhaTelemetria(2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1),
                new LinhaTelemetria(3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1));
        JanelaRecebida rapida = new JanelaRecebida(1L, true, 5, Instant.now(), true, 1120, false, ModoJanela.RAPIDO,
                1600, 1600, "fw", null, null, pontos, linhas, Map.of());
        when(repositorio.ativo(anyLong(), anyBoolean())).thenReturn(Optional.empty());
        assertThat(s.opinar(rapida, null)).isEmpty();

        when(repositorio.ativo(1, true)).thenReturn(Optional.of(linha("v1", metaJson)));
        when(repositorio.arquivos(9)).thenReturn(new ModeloRepository.Arquivos(MotorOnnxTest.ler("anomalia.onnx"),
                MotorOnnxTest.ler("classe.onnx"), null));
        s.esquecer();
        when(referencias.ativa(1, true)).thenReturn(Optional.empty());
        assertThat(s.opinar(rapida, null)).isEmpty();
        when(referencias.ativa(1, true)).thenReturn(Optional.of(VetorCaracteristicasTest.referencia(null)));
        assertThat(s.opinar(rapida, null)).isEmpty(); // modo rápido: sem vetor
        JanelaRecebida normal = new JanelaRecebida(1L, true, 6, Instant.now(), true, 1120, false, ModoJanela.NORMAL,
                8000, 8000, "fw", null, null, pontos, linhas, Map.of());
        assertThat(s.opinar(normal, "T3")).isPresent();
        assertThat(InferenciaService.rotulo("z_C_o2x")).isEqualTo("C·2X");
    }
}
