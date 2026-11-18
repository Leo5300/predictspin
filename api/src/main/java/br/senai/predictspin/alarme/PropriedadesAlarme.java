package br.senai.predictspin.alarme;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Regra de alarme (ISA-18.2). Todos os números são PROPOSTA a confirmar com dado real
 * (docs/alarmes.md); a rota de limites os serve ao painel. Tempos em segundos, não em janelas (no modo
 * rápido a janela é de 1 s).
 *
 * @param zAtencao      z a partir do qual o ponto está em ATENÇÃO
 * @param zAlarme       z a partir do qual o ponto está em ALARME
 * @param atrasoS       só entra no estado depois deste tempo seguido acima do limite
 * @param histereseZ    só sai quando z fica abaixo do limite menos isto...
 * @param saidaS        ...por este tempo seguido
 * @param instrumentoS  tempo de ponto ausente ou de sinal sumido que abre alerta de instrumento
 * @param sinalFracao   "sinal sumido": RMS e 1X abaixo desta fração do típico
 * @param indicadoresH  período (h) dos indicadores do Diagnóstico: alertas por hora, rajada, repetitivos,
 *                      calibração diferente e deriva
 * @param rajadaMin     intervalo (min) da "pior rajada" e dos repetitivos
 * @param repetitivoVezes  o mesmo alerta aberto ou reaberto este número de vezes no intervalo = repetitivo
 * @param paradoH       alerta ativo há mais que isto (h) conta como parado
 * @param supressaoOpcoesMin  prazos de supressão oferecidos no painel (min)
 * @param supressaoMaxMin     maior prazo de supressão aceito pela API (min)
 */
@ConfigurationProperties("ps.alarme")
public record PropriedadesAlarme(
        @DefaultValue("3") double zAtencao,
        @DefaultValue("5") double zAlarme,
        @DefaultValue("15") double atrasoS,
        @DefaultValue("1") double histereseZ,
        @DefaultValue("15") double saidaS,
        @DefaultValue("30") double instrumentoS,
        @DefaultValue("0.5") double sinalFracao,
        @DefaultValue("24") int indicadoresH,
        @DefaultValue("10") int rajadaMin,
        @DefaultValue("3") int repetitivoVezes,
        @DefaultValue("24") int paradoH,
        @DefaultValue({"15", "60", "240", "1440"}) List<Integer> supressaoOpcoesMin,
        @DefaultValue("10080") int supressaoMaxMin) {

    /** Limite de z de um nível (ATENÇÃO ou ALARME). */
    public double limite(Nivel nivel) {
        return nivel == Nivel.ALARME ? zAlarme : zAtencao;
    }

    /** Nível pelo z, sem atraso nem histerese. */
    public Nivel nivelBruto(Double z) {
        if (z == null || z < zAtencao) {
            return Nivel.NORMAL;
        }
        return z >= zAlarme ? Nivel.ALARME : Nivel.ATENCAO;
    }
}
