import {
  destinoDaNotificacao,
  EXPLICACAO_SEM_PUSH,
  oQueChegaPorPush,
  porQueSemPush,
  resumoDoPush,
  situacaoDaPermissao,
  type EstadoDoPush,
} from './notificacao'

describe('destino da notificação tocada (conteúdo do PushService da API)', () => {
  it('alarme e alarme de instrumento abrem o alarme; OS abre a OS', () => {
    expect(destinoDaNotificacao({ tipo: 'alarme', alerta_id: 12, maquina_id: 1, simulado: false })).toEqual({
      tela: 'alarme',
      alertaId: 12,
      simulado: false,
    })
    expect(destinoDaNotificacao({ tipo: 'alerta', alerta_id: 7, maquina_id: 1, simulado: true })).toEqual({
      tela: 'alarme',
      alertaId: 7,
      simulado: true,
    })
    expect(destinoDaNotificacao({ tipo: 'os', os_id: 3, maquina_id: 1, simulado: true })).toEqual({
      tela: 'os',
      osId: 3,
      simulado: true,
    })
  })

  it('aceita número e "true" vindos como texto (Android)', () => {
    expect(destinoDaNotificacao({ tipo: 'alarme', alerta_id: '42', simulado: 'true' })).toEqual({
      tela: 'alarme',
      alertaId: 42,
      simulado: true,
    })
  })

  it('o que não tem o formato só abre o app', () => {
    expect(destinoDaNotificacao(null)).toBeNull()
    expect(destinoDaNotificacao('alarme')).toBeNull()
    expect(destinoDaNotificacao({})).toBeNull()
    expect(destinoDaNotificacao({ tipo: 'janela', alerta_id: 1 })).toBeNull()
    expect(destinoDaNotificacao({ tipo: 'alarme' })).toBeNull()
    expect(destinoDaNotificacao({ tipo: 'alarme', alerta_id: -1 })).toBeNull()
    expect(destinoDaNotificacao({ tipo: 'alarme', alerta_id: 1.5 })).toBeNull()
    expect(destinoDaNotificacao({ tipo: 'alarme', alerta_id: '12a' })).toBeNull()
    expect(destinoDaNotificacao({ tipo: 'os', alerta_id: 1 })).toBeNull()
  })
})

describe('onde há push', () => {
  const comPush = { expoGo: false, plataforma: 'android', projectId: 'abc' }

  it('Expo Go não tem push em nenhum sistema; navegador também não', () => {
    expect(porQueSemPush({ ...comPush, expoGo: true })).toBe('expo_go')
    expect(porQueSemPush({ ...comPush, expoGo: true, plataforma: 'ios' })).toBe('expo_go')
    expect(porQueSemPush({ ...comPush, plataforma: 'web' })).toBe('web')
  })

  it('build sem o projeto do EAS não recebe token', () => {
    expect(porQueSemPush({ ...comPush, projectId: null })).toBe('sem_projeto')
  })

  it('build próprio com projeto tem push no Android e no iPhone', () => {
    expect(porQueSemPush(comPush)).toBeNull()
    expect(porQueSemPush({ ...comPush, plataforma: 'ios' })).toBeNull()
  })
})

describe('permissão do sistema', () => {
  it('concedida: nada a pedir', () => {
    expect(situacaoDaPermissao({ granted: true, status: 'granted', canAskAgain: true }, false)).toEqual({
      concedida: true,
      podePedir: false,
      oferecer: false,
    })
  })

  it('nunca perguntada: o app oferece, a menos que a pessoa tenha adiado', () => {
    const nunca = { granted: false, status: 'undetermined', canAskAgain: true }
    expect(situacaoDaPermissao(nunca, false)).toEqual({ concedida: false, podePedir: true, oferecer: true })
    expect(situacaoDaPermissao(nunca, true)).toEqual({ concedida: false, podePedir: true, oferecer: false })
  })

  it('negada: não oferece de novo; pode pedir só se o sistema deixar', () => {
    expect(situacaoDaPermissao({ granted: false, status: 'denied', canAskAgain: true }, false)).toEqual({
      concedida: false,
      podePedir: true,
      oferecer: false,
    })
    expect(situacaoDaPermissao({ granted: false, status: 'denied', canAskAgain: false }, false)).toEqual({
      concedida: false,
      podePedir: false,
      oferecer: false,
    })
  })
})

describe('o que chega e o que a Conta diz', () => {
  it('operador recebe só alarme; técnico e administrador, também OS e sensor', () => {
    expect(oQueChegaPorPush('OPERADOR')).toBe('alarme novo')
    expect(oQueChegaPorPush('TECNICO')).toContain('OS aberta')
    expect(oQueChegaPorPush('ADMIN')).toContain('problema de sensor')
  })

  it('cada estado tem um texto e, quando cabe, um botão', () => {
    const casos: [EstadoDoPush, string, string | null][] = [
      [{ fase: 'verificando' }, 'Conferindo…', null],
      [{ fase: 'indisponivel', motivo: 'expo_go' }, 'Notificações indisponíveis neste modo.', null],
      [{ fase: 'desligado', podePedir: true, oferecer: false }, 'Desligadas neste celular.', 'ligar'],
      [{ fase: 'desligado', podePedir: false, oferecer: false }, 'Desligadas nas configurações do celular.', 'configuracoes'],
      [{ fase: 'registrando' }, 'Registrando este celular…', null],
      [{ fase: 'registrado', envioHabilitado: true }, 'Ligadas.', null],
      [{ fase: 'falhou', onde: 'expo' }, 'O celular não conseguiu o endereço de push.', 'tentar'],
      [{ fase: 'falhou', onde: 'api' }, 'A API não registrou este celular.', 'tentar'],
    ]
    for (const [estado, texto, acao] of casos) {
      const resumo = resumoDoPush(estado, 'TECNICO')
      expect(resumo.texto).toBe(texto)
      expect(resumo.acao).toBe(acao)
    }
  })

  it('indisponível explica o motivo; registrado sem envio diz que a API está com o push desligado', () => {
    expect(resumoDoPush({ fase: 'indisponivel', motivo: 'expo_go' }, 'ADMIN').detalhe).toBe(
      EXPLICACAO_SEM_PUSH.expo_go,
    )
    expect(resumoDoPush({ fase: 'registrado', envioHabilitado: false }, 'ADMIN').texto).toContain(
      'envio de push está desligado na API',
    )
    expect(resumoDoPush({ fase: 'registrado', envioHabilitado: true }, 'OPERADOR').detalhe).toBe(
      'Chegam: alarme novo. Nunca a cada janela.',
    )
  })
})
