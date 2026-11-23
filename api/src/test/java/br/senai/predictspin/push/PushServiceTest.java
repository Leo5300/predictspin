package br.senai.predictspin.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import br.senai.predictspin.alarme.Nivel;
import br.senai.predictspin.alerta.AlertaAlterado;
import br.senai.predictspin.alerta.EstadoAlerta;
import br.senai.predictspin.alerta.dto.AlertaEvento;
import br.senai.predictspin.alerta.dto.AlertaResposta;
import br.senai.predictspin.ordemservico.OrdemServicoAlterada;
import br.senai.predictspin.ordemservico.dto.OrdemServicoEvento;
import br.senai.predictspin.ordemservico.dto.OrdemServicoResposta;

/** Regras de quando o push sai (sem banco e sem rede). */
class PushServiceTest {

    private static AlertaResposta alerta(String tipo, Nivel nivel, EstadoAlerta estado, boolean condicao) {
        AlertaResposta a = mock(AlertaResposta.class);
        when(a.id()).thenReturn(7L);
        when(a.maquinaId()).thenReturn(1L);
        when(a.maquina()).thenReturn("TORNO-01");
        when(a.ponto()).thenReturn("B");
        when(a.tipo()).thenReturn(tipo);
        when(a.nivel()).thenReturn(nivel);
        when(a.estado()).thenReturn(estado);
        when(a.duranteEnsaioDeCondicao()).thenReturn(condicao);
        when(a.componente()).thenReturn("ferramenta e porta-ferramenta");
        when(a.explicacao()).thenReturn("B·RMS 6,1σ acima do típico da marcha 1120; B·pico 5,2σ acima.");
        return a;
    }

    private static AlertaResposta maquina(Nivel nivel) {
        return alerta("maquina", nivel, EstadoAlerta.ATIVO_NAO_RECONHECIDO, false);
    }

    @Test
    void soEntradaEmAlarmeGeraPushDeMaquina() {
        assertThat(PushService.gatilho("abriu", maquina(Nivel.ALARME))).isPresent();
        assertThat(PushService.gatilho("piorou", maquina(Nivel.ALARME))).isPresent();
        assertThat(PushService.gatilho("abriu", maquina(Nivel.ATENCAO))).isEmpty();
        assertThat(PushService.gatilho("piorou", maquina(Nivel.ATENCAO))).isEmpty();
        for (String acao : new String[] {"normalizou", "reconhecido", "suprimido", "supressao_encerrada", "encerrado"}) {
            assertThat(PushService.gatilho(acao, maquina(Nivel.ALARME))).as(acao).isEmpty();
        }
        // suprimido (voltou a piorar durante a supressão) e ensaio de condição: não avisam
        assertThat(PushService.gatilho("piorou", alerta("maquina", Nivel.ALARME, EstadoAlerta.SUPRIMIDO, false)))
                .isEmpty();
        assertThat(PushService.gatilho("abriu", alerta("maquina", Nivel.ALARME, EstadoAlerta.ATIVO_NAO_RECONHECIDO,
                true))).isEmpty();
    }

    @Test
    void conteudoCurtoSemDadoSensivelEDestinatarios() {
        PushService.Gatilho g = PushService.gatilho("abriu", maquina(Nivel.ALARME)).orElseThrow();
        assertThat(g.titulo()).isEqualTo("ALARME · TORNO-01 · ponto B");
        assertThat(g.corpo()).isEqualTo("Ferramenta e porta-ferramenta: B·RMS 6,1σ acima do típico da marcha 1120. "
                + "Toque para ver.");
        assertThat(g.papeis()).containsExactlyInAnyOrder("ADMIN", "TECNICO", "OPERADOR");
        assertThat(g.dados()).containsEntry("tipo", "alarme").containsEntry("alerta_id", 7L);

        PushService.Gatilho s = PushService.gatilho("abriu",
                alerta("instrumento", Nivel.ATENCAO, EstadoAlerta.ATIVO_NAO_RECONHECIDO, false)).orElseThrow();
        assertThat(s.tipo()).isEqualTo("instrumento");
        assertThat(s.titulo()).isEqualTo("SENSOR · TORNO-01 · ponto B");
        assertThat(s.papeis()).containsExactlyInAnyOrder("ADMIN", "TECNICO");
        assertThat(PushService.gatilho("normalizou",
                alerta("instrumento", Nivel.ATENCAO, EstadoAlerta.NORMALIZADO_NAO_RECONHECIDO, false))).isEmpty();

        assertThat(PushService.titulo("ALARME", "TORNO-01", "A", true)).isEqualTo("SIMULADO · ALARME · TORNO-01 · ponto A");
        assertThat(PushService.curto("x".repeat(400))).hasSize(178).endsWith("…");
        assertThat(PushService.primeiraParte("só uma parte.")).isEqualTo("só uma parte");
    }

    @Test
    void osSoQuandoAbre() {
        OrdemServicoResposta os = mock(OrdemServicoResposta.class);
        when(os.id()).thenReturn(3L);
        when(os.numero()).thenReturn("OS-2026-0003");
        when(os.maquina()).thenReturn("TORNO-01");
        when(os.ponto()).thenReturn("A");
        when(os.componente()).thenReturn("eixo-árvore e mancal dianteiro");
        PushService.Gatilho g = PushService.gatilho("aberta", os).orElseThrow();
        assertThat(g.titulo()).isEqualTo("OS ABERTA · TORNO-01 · ponto A");
        assertThat(g.corpo()).isEqualTo("OS-2026-0003 · eixo-árvore e mancal dianteiro. Para quem conserta. Toque para ver.");
        assertThat(g.papeis()).containsExactlyInAnyOrder("ADMIN", "TECNICO");
        assertThat(PushService.gatilho("assumida", os)).isEmpty();
        assertThat(PushService.gatilho("concluida", os)).isEmpty();
    }

    @Test
    void desligadoNaoFazNada() {
        PushSql sql = mock(PushSql.class);
        ClienteExpo expo = mock(ClienteExpo.class);
        PropriedadesPush prop = new PropriedadesPush(false, "http://127.0.0.1:1/", "", 100, 15, 10, 100, 10);
        PushService push = new PushService(prop, sql, expo, mock(TransactionTemplate.class), Clock.systemUTC());
        try {
            push.aoAlterarAlerta(new AlertaAlterado(1L, true, new AlertaEvento("abriu", maquina(Nivel.ALARME))));
            push.aoAlterarOrdemServico(new OrdemServicoAlterada(1L, true,
                    new OrdemServicoEvento("aberta", mock(OrdemServicoResposta.class))));
            verifyNoInteractions(sql, expo);
            assertThat(push.diagnostico().habilitado()).isFalse();
        } finally {
            push.parar();
        }
    }
}
