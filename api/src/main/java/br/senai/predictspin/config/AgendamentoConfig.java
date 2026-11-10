package br.senai.predictspin.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Habilita tarefas periódicas (limpeza do contador de tentativas de login). */
@Configuration
@EnableScheduling
public class AgendamentoConfig {
}
