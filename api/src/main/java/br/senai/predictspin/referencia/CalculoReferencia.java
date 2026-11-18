package br.senai.predictspin.referencia;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.senai.predictspin.referencia.ReferenciaRepository.LinhaJanela;
import br.senai.predictspin.referencia.ReferenciaRepository.NovaCelula;

/**
 * Cálculo de uma versão da referência a partir das janelas (sem banco, para ser testado à parte).
 * <ol>
 *   <li>Filtro de qualidade ({@link FiltroQualidade}) e seleção: só ensaios "normal", nunca T2.</li>
 *   <li>Calibração: em cada ponto vale a calibração da janela boa mais recente; janelas do ponto com
 *       outra calibração ficam de fora (calibrar muda os valores em g em cerca de 7%).</li>
 *   <li>Célula = ponto × medida × marcha × etapa e, no T3, também a receita (material + ferramenta).
 *       O T3 genérico junta todas as receitas.</li>
 *   <li>Deriva: janelas de uso avaliadas NORMAL entram nas células T0, T1 e T3 genérica, no máximo
 *       {@code fracaoMaxima} das janelas da célula, as mais recentes primeiro. Nunca em célula de receita.</li>
 *   <li>Piso de ruído: p95 da medida no T0 do ponto (RMS, pico e velocidade), quando o T0 tem janelas
 *       suficientes.</li>
 * </ol>
 */
public final class CalculoReferencia {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_FIRMWARES = 200;

    private CalculoReferencia() {
    }

    public record Resultado(List<NovaCelula> celulas, Map<MotivoExclusao, Integer> excluidas, int janelasUsadas,
                            int janelasDeriva, boolean pisoMedido) {
    }

    private record Chave(long pontoId, Medida medida, int marcha, String etapa, boolean porReceita, Long materialId,
                         Long ferramentaId) {
    }

    private static final class Balde {
        private final List<Double> valores = new ArrayList<>();
        private final Set<String> firmwares = new TreeSet<>();
        private int ensaio;
        private int deriva;
    }

    public static Resultado calcular(List<LinhaJanela> ensaios, List<LinhaJanela> deriva, List<Integer> marchas,
                                     PropriedadesReferencia p) {
        Map<MotivoExclusao, Integer> excluidas = new EnumMap<>(MotivoExclusao.class);
        List<LinhaJanela> boas = new ArrayList<>();
        for (List<LinhaJanela> janela : porJanela(ensaios).values()) {
            Set<MotivoExclusao> motivos = new HashSet<>(motivosDoFiltro(janela, marchas, p));
            LinhaJanela primeira = janela.get(0);
            if (!"normal".equals(primeira.condicao())) {
                motivos.add(MotivoExclusao.CONDICAO_NAO_NORMAL);
            }
            if ("T2".equals(primeira.etapa())) {
                motivos.add(MotivoExclusao.ETAPA_T2);
            }
            if (motivos.isEmpty()) {
                boas.addAll(janela);
            } else {
                motivos.forEach(m -> excluidas.merge(m, 1, Integer::sum));
            }
        }

        Map<Long, String> calibracaoVigente = calibracaoVigente(boas);
        Map<Chave, Balde> baldes = new LinkedHashMap<>();
        Set<Long> usadas = new HashSet<>();
        for (LinhaJanela linha : boas) {
            if (!Objects.equals(calibracao(linha), calibracaoVigente.get(linha.pontoId()))) {
                excluidas.merge(MotivoExclusao.CALIBRACAO_ANTIGA, 1, Integer::sum);
                continue;
            }
            usadas.add(linha.janelaId());
            int marcha = FiltroQualidade.marcha(linha.rotacaoRpm(), marchas);
            boolean receita = "T3".equals(linha.etapa())
                    && (linha.materialId() != null || linha.ferramentaId() != null);
            for (Medida medida : Medida.values()) {
                Double valor = linha.valor(medida);
                if (valor == null || (medida.ordem() && marcha == 0)) {
                    continue;
                }
                acumular(baldes, new Chave(linha.pontoId(), medida, marcha, linha.etapa(), false, null, null),
                        valor, linha.firmwareVersao(), false);
                if (receita) {
                    acumular(baldes, new Chave(linha.pontoId(), medida, marcha, linha.etapa(), true,
                            linha.materialId(), linha.ferramentaId()), valor, linha.firmwareVersao(), false);
                }
            }
        }

        Set<Long> usadasDeriva = p.deriva().habilitada()
                ? somarDeriva(baldes, deriva, marchas, calibracaoVigente, p) : Set.of();

        Map<Long, Map<Medida, Double>> pisos = pisos(baldes, p.minJanelas());
        List<NovaCelula> celulas = new ArrayList<>(baldes.size());
        baldes.forEach((chave, balde) -> {
            double[] valores = balde.valores.stream().mapToDouble(Double::doubleValue).toArray();
            Estatistica.Resumo resumo = Estatistica.resumir(valores);
            Double piso = chave.medida().temPiso()
                    ? pisos.getOrDefault(chave.pontoId(), Map.of()).get(chave.medida()) : null;
            celulas.add(new NovaCelula(chave.pontoId(), chave.medida(), chave.marcha(), chave.etapa(),
                    chave.porReceita(), chave.materialId(), chave.ferramentaId(), resumo.n(), balde.deriva,
                    resumo.mediana(), resumo.sigma(), resumo.p95(), piso,
                    Estatistica.sigmaEfetivo(resumo.sigma(), piso, p.sigmaMinFracao(), resumo.mediana()),
                    resumo.n() >= p.minJanelas(), calibracaoVigente.get(chave.pontoId()),
                    firmwares(balde.firmwares)));
        });
        return new Resultado(celulas, excluidas, usadas.size(), usadasDeriva.size(), !pisos.isEmpty());
    }

    private static Set<MotivoExclusao> motivosDoFiltro(List<LinhaJanela> janela, List<Integer> marchas,
                                                       PropriedadesReferencia p) {
        LinhaJanela primeira = janela.get(0);
        boolean ordensZeradas = janela.stream().anyMatch(LinhaJanela::ordensZeradas);
        return FiltroQualidade.motivos(new FiltroQualidade.Entrada(primeira.saturou(), primeira.modo(),
                primeira.amostras(), primeira.amostrasEsperadas(), primeira.rotacaoRpm(), ordensZeradas,
                primeira.descartado()), marchas, p);
    }

    private static Map<Long, List<LinhaJanela>> porJanela(List<LinhaJanela> linhas) {
        Map<Long, List<LinhaJanela>> janelas = new LinkedHashMap<>();
        for (LinhaJanela linha : linhas) {
            janelas.computeIfAbsent(linha.janelaId(), k -> new ArrayList<>()).add(linha);
        }
        return janelas;
    }

    /** Calibração da janela boa mais recente de cada ponto (nula quando o firmware não informa). */
    private static Map<Long, String> calibracaoVigente(List<LinhaJanela> boas) {
        Map<Long, LinhaJanela> maisRecente = new HashMap<>();
        for (LinhaJanela linha : boas) {
            maisRecente.merge(linha.pontoId(), linha,
                    (atual, nova) -> nova.medidoEm().isAfter(atual.medidoEm()) ? nova : atual);
        }
        Map<Long, String> vigente = new HashMap<>();
        maisRecente.forEach((ponto, linha) -> vigente.put(ponto, calibracao(linha)));
        return vigente;
    }

    /** Identificador da calibração do ponto na janela, lido do JSON compacto ({"A":"..."}). */
    public static String calibracao(LinhaJanela linha) {
        return calibracaoDoPonto(linha.calibracaoJson(), linha.ponto());
    }

    public static String calibracaoDoPonto(String calibracaoJson, String ponto) {
        if (calibracaoJson == null || calibracaoJson.isBlank()) {
            return null;
        }
        try {
            return JSON.readValue(calibracaoJson, new TypeReference<Map<String, String>>() { }).get(ponto);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return null;
        }
    }

    private static void acumular(Map<Chave, Balde> baldes, Chave chave, double valor, String firmware,
                                 boolean deriva) {
        Balde balde = baldes.computeIfAbsent(chave, k -> new Balde());
        balde.valores.add(valor);
        if (firmware != null) {
            balde.firmwares.add(firmware);
        }
        if (deriva) {
            balde.deriva++;
        } else {
            balde.ensaio++;
        }
    }

    /** Soma as janelas de uso às células já existentes, até o limite de cada célula. */
    private static Set<Long> somarDeriva(Map<Chave, Balde> baldes, List<LinhaJanela> deriva, List<Integer> marchas,
                                         Map<Long, String> calibracaoVigente, PropriedadesReferencia p) {
        double fracao = p.deriva().fracaoMaxima();
        Set<Long> usadas = new HashSet<>();
        for (List<LinhaJanela> janela : porJanela(deriva).values()) {
            if (!motivosDoFiltro(janela, marchas, p).isEmpty()) {
                continue;
            }
            for (LinhaJanela linha : janela) {
                if (!calibracaoVigente.containsKey(linha.pontoId())
                        || !Objects.equals(calibracao(linha), calibracaoVigente.get(linha.pontoId()))) {
                    continue;
                }
                int marcha = FiltroQualidade.marcha(linha.rotacaoRpm(), marchas);
                for (Medida medida : Medida.values()) {
                    Double valor = linha.valor(medida);
                    Balde balde = baldes.get(new Chave(linha.pontoId(), medida, marcha, linha.etapa(), false, null,
                            null));
                    if (valor == null || balde == null || balde.deriva + 1 > limiteDeriva(balde.ensaio, fracao)) {
                        continue;
                    }
                    acumular(baldes, new Chave(linha.pontoId(), medida, marcha, linha.etapa(), false, null, null),
                            valor, linha.firmwareVersao(), true);
                    usadas.add(linha.janelaId());
                }
            }
        }
        return usadas;
    }

    /** Maior número de janelas de deriva d com d ≤ fração × (n_ensaio + d). */
    static int limiteDeriva(int nEnsaio, double fracao) {
        if (fracao <= 0 || fracao >= 1) {
            return fracao >= 1 ? Integer.MAX_VALUE : 0;
        }
        return (int) Math.floor(fracao / (1 - fracao) * nEnsaio + 1e-9);
    }

    /** p95 de RMS, pico e velocidade no T0 de cada ponto (todas as marchas juntas), se houver janelas. */
    private static Map<Long, Map<Medida, Double>> pisos(Map<Chave, Balde> baldes, int minJanelas) {
        Map<Long, Map<Medida, List<Double>>> t0 = new HashMap<>();
        baldes.forEach((chave, balde) -> {
            if ("T0".equals(chave.etapa()) && chave.medida().temPiso()) {
                t0.computeIfAbsent(chave.pontoId(), k -> new EnumMap<>(Medida.class))
                        .computeIfAbsent(chave.medida(), k -> new ArrayList<>()).addAll(balde.valores);
            }
        });
        Map<Long, Map<Medida, Double>> pisos = new HashMap<>();
        t0.forEach((ponto, porMedida) -> porMedida.forEach((medida, valores) -> {
            if (valores.size() >= minJanelas) {
                double[] ordenados = valores.stream().mapToDouble(Double::doubleValue).sorted().toArray();
                pisos.computeIfAbsent(ponto, k -> new EnumMap<>(Medida.class))
                        .put(medida, Estatistica.percentil(ordenados, 0.95));
            }
        }));
        return pisos;
    }

    private static String firmwares(Set<String> versoes) {
        if (versoes.isEmpty()) {
            return null;
        }
        String texto = String.join(",", versoes);
        return texto.length() <= MAX_FIRMWARES ? texto : texto.substring(0, MAX_FIRMWARES);
    }
}
