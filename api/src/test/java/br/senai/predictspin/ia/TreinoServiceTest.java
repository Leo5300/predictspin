package br.senai.predictspin.ia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;

import br.senai.predictspin.maquina.MaquinaRepository;
import br.senai.predictspin.referencia.ReferenciaService;

/** Acordar e pedir o treino quando a rede falha (sem banco: repositório falso). */
class TreinoServiceTest {

    private final ModeloRepository repositorio = mock(ModeloRepository.class);

    private TreinoService servico(String url) {
        when(repositorio.travarTrabalho(anyLong())).thenReturn(Optional.of("acordando"));
        when(repositorio.trabalho(anyLong())).thenReturn(Optional.of(new ModeloRepository.Trabalho(7, 1, true,
                "falhou", "x", Instant.now(), null, null, null, null, null)));
        TreinoService s = new TreinoService(repositorio, mock(MaquinaRepository.class), mock(ReferenciaService.class),
                mock(InferenciaService.class),
                new PropriedadesTreino(url, "chave", 1, 30, true, 2, 5, "America/Sao_Paulo", 1000),
                new PropriedadesModelo(99, 0.6, 5, 100, 60, 10, 42, 3),
                new PropriedadesFusao(Map.of()), new PropriedadesTendencia(false, 7, 60, 600, 3, 60),
                new ObjectMapper(), mock(ApplicationEventPublisher.class), Clock.systemUTC(),
                mock(PlatformTransactionManager.class));
        s.intervaloSondagem(Duration.ofMillis(50));
        return s;
    }

    private static int portaFechada() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    @Test
    void servicoInalcancavelFazOTrabalhoFalharPeloPrazo() throws IOException {
        servico("http://127.0.0.1:" + portaFechada()).acordarEPedir(7);
        verify(repositorio).mudarTrabalho(eq(7L), eq("falhou"), eq("o serviço de treino não respondeu em 1 s"),
                isNull(), any(), isNull());
    }

    @Test
    void servicoQueCaiAoPedirOTreinoFazOTrabalhoFalhar() throws IOException {
        HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.createContext("/saude", ex -> {
            ex.sendResponseHeaders(200, -1);
            ex.close();
        });
        // fecha a conexão sem responder: o cliente recebe erro de E/S
        srv.createContext("/treinar", ex -> ex.getHttpContext().getServer().stop(0));
        srv.start();
        try {
            servico("http://127.0.0.1:" + srv.getAddress().getPort()).acordarEPedir(7);
        } finally {
            srv.stop(0);
        }
        verify(repositorio).mudarTrabalho(eq(7L), eq("falhou"),
                org.mockito.ArgumentMatchers.startsWith("falha ao chamar o serviço de treino"), isNull(), any(),
                isNull());
    }

    @Test
    void trabalhoQueJaAvancouNaoMudaDeNovo() throws IOException {
        HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.createContext("/saude", ex -> {
            ex.sendResponseHeaders(200, -1);
            ex.close();
        });
        srv.createContext("/treinar", ex -> {
            ex.sendResponseHeaders(202, -1);
            ex.close();
        });
        srv.start();
        TreinoService s = servico("http://127.0.0.1:" + srv.getAddress().getPort());
        // o serviço avisou o início antes da resposta 202 chegar: o trabalho já está executando
        when(repositorio.travarTrabalho(7)).thenReturn(Optional.of("executando"));
        try {
            s.acordarEPedir(7);
        } finally {
            srv.stop(0);
        }
        verify(repositorio, never()).mudarTrabalho(anyLong(), any(), any(), any(), any(), any());
    }
}
