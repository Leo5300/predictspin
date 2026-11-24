import { waitFor } from '@testing-library/react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as Network from 'expo-network'
import * as SecureStore from 'expo-secure-store'

import { erroDaApi, simularApi } from '@/testes/ajudantes'
import { alarme, detalhe, janela, pontoDaJanela, respostaLogin, usuario } from '@/testes/exemplos'

import { CHAVES, ler } from './armazenamento'
import { abrirSessaoGuardada, destravar, emailLembrado, entrar, esquecerEmail, sair } from './autenticacao'
import {
  biometriaDisponivel,
  gravarPreferenciaBiometria,
  lerPreferenciaBiometria,
  nomeDaBiometria,
} from './biometria'
import { api, exigir } from './cliente'
import { URL_API } from './configuracao'
import {
  cancelarSupressao,
  consultaAlarme,
  consultaAlarmes,
  consultaAvaliacao,
  consultaLimites,
  consultaMaquinas,
  consultaPontos,
  consultaSerieRecente,
  consultaUltimaJanela,
  reconhecerAlarme,
  suprimirAlarme,
} from './consultas'
import { ehNaoEncontrado, ehSemPermissao, ErroApi, ErroRede, lerRetryAfter, mensagemDoErro } from './erros'
import { assinarEventos, type EstadoEventos } from './eventos'
import {
  aoApiVoltar,
  definirRedeDoAparelho,
  obterSaude,
  registrarFalha,
  reiniciarSaudeParaTeste,
  vigiarRedeDoAparelho,
} from './saude'
import {
  AVISO_SESSAO_EXPIRADA,
  aoEncerrarSessao,
  encerrarSessao,
  iniciarSessao,
  lerGuardado,
  obterSessao,
  reiniciarSessaoParaTeste,
  tokenAtual,
  venceu,
} from './sessao'

const guardado = (SecureStore as unknown as { __guardado: Map<string, string> }).__guardado
const biometria = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>

function comBiometria(tem: boolean, sucesso = true) {
  biometria.hasHardwareAsync.mockResolvedValue(tem)
  biometria.isEnrolledAsync.mockResolvedValue(tem)
  biometria.authenticateAsync.mockResolvedValue(
    sucesso ? { success: true } : { success: false, error: 'user_cancel' },
  )
}

/** Chama algo que leia a consulta: queryFn com um sinal novo. */
function rodar<T>(opcoes: { queryFn?: unknown }): Promise<T> {
  const fn = opcoes.queryFn as (c: { signal: AbortSignal }) => Promise<T>
  return fn({ signal: new AbortController().signal })
}

beforeEach(() => {
  guardado.clear()
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
  comBiometria(false)
  jest.useRealTimers()
})

// o vencimento da sessão e a sonda de saúde são temporizadores: nada pode ficar vivo depois da suíte
afterAll(() => {
  reiniciarSessaoParaTeste()
  reiniciarSaudeParaTeste()
})

describe('cliente da API', () => {
  it('usa o endereço do .env e põe o token no cabeçalho', async () => {
    const { pedidos } = simularApi({ 'GET /api/v1/maquinas': () => ({ corpo: { conteudo: [] } }) })
    await iniciarSessao(respostaLogin())
    await exigir(api.GET('/api/v1/maquinas'))
    expect(URL_API).toBe('http://192.168.0.10:8080')
    expect(pedidos[0]?.cabecalhos.get('Authorization')).toBe('Bearer token-de-teste')
  })

  it('401 em qualquer chamada encerra a sessão com aviso e apaga o token', async () => {
    simularApi({ 'GET /api/v1/maquinas': () => erroDaApi(401, 'Token inválido.') })
    await iniciarSessao(respostaLogin())
    const limpou = jest.fn()
    aoEncerrarSessao(limpou)
    await expect(exigir(api.GET('/api/v1/maquinas'))).rejects.toBeInstanceOf(ErroApi)
    await new Promise((r) => setTimeout(r, 0))
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
    expect(limpou).toHaveBeenCalled()
    expect(guardado.has(CHAVES.sessao)).toBe(false)
  })

  it('403 vira mensagem clara, sem encerrar a sessão', async () => {
    simularApi({ 'POST /api/v1/alertas/41/suprimir': () => erroDaApi(403, 'Forbidden') })
    await iniciarSessao(respostaLogin())
    const erro = await suprimirAlarme(41, 'motivo', 60).catch((e: unknown) => e)
    expect(ehSemPermissao(erro)).toBe(true)
    expect(mensagemDoErro(erro)).toBe('Seu papel não permite esta ação. A API recusou o pedido.')
    expect(obterSessao().fase).toBe('autenticada')
  })

  it('429 traz o Retry-After', async () => {
    simularApi({
      'POST /api/v1/auth/login': () => ({ ...erroDaApi(429, 'Muitas tentativas.'), cabecalhos: { 'Retry-After': '120' } }),
    })
    const erro = (await entrar('a@b.test', 'x').catch((e: unknown) => e)) as ErroApi
    expect(erro.status).toBe(429)
    expect(erro.esperarS).toBe(120)
    expect(mensagemDoErro(erro)).toBe('Muitas tentativas. Tente de novo em 2 min.')
  })

  it('sem conexão vira ErroRede e marca a API como falhando', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed')
    }) as unknown as typeof fetch
    const erro = await exigir(api.GET('/api/v1/maquinas')).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroRede)
    expect((erro as ErroRede).acordando).toBe(true)
    expect(obterSaude().falhandoDesdeMs).not.toBeNull()
  })

  it('sem rede no aparelho, a mensagem é de sem conexão', async () => {
    definirRedeDoAparelho(false)
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed')
    }) as unknown as typeof fetch
    const erro = (await exigir(api.GET('/api/v1/maquinas')).catch((e: unknown) => e)) as ErroRede
    expect(erro.acordando).toBe(false)
    expect(mensagemDoErro(erro)).toContain('Sem conexão')
  })

  it('502 do proxy sem JSON é a API acordando', async () => {
    global.fetch = jest.fn(async () => new Response('<html>', { status: 502, headers: { 'Content-Type': 'text/html' } })) as unknown as typeof fetch
    const erro = (await exigir(api.GET('/api/v1/maquinas')).catch((e: unknown) => e)) as ErroRede
    expect(erro).toBeInstanceOf(ErroRede)
    expect(mensagemDoErro(erro)).toContain('Acordando o servidor')
  })

  it('aceita a resposta do fetch do Expo, que não é instanceof Response (como no celular)', async () => {
    // no celular o fetch global é o expo/fetch, cuja resposta é de outra classe: o login quebrava com
    // "onResponse: must return new Response()". Aqui a resposta é embrulhada numa classe à parte.
    class RespostaDoExpo {
      constructor(private readonly r: Response) {}
      get status() { return this.r.status }
      get ok() { return this.r.ok }
      get headers() { return this.r.headers }
      text() { return this.r.text() }
      json() { return this.r.json() }
    }
    const json = { 'Content-Type': 'application/json' }
    global.fetch = jest.fn(async (url: string) => {
      const resposta = url.endsWith('/api/v1/auth/login')
        ? new Response(JSON.stringify(respostaLogin()), { status: 200, headers: json })
        : new Response(JSON.stringify({ mensagem: 'Token inválido.' }), { status: 401, headers: json })
      const embrulhada = new RespostaDoExpo(resposta)
      expect(embrulhada).not.toBeInstanceOf(Response)
      return embrulhada
    }) as unknown as typeof fetch
    await entrar('a@b.test', 'x')
    expect(obterSessao().fase).toBe('autenticada')
    // e o 401 fora do login continua encerrando a sessão
    await expect(exigir(api.GET('/api/v1/maquinas'))).rejects.toBeInstanceOf(ErroApi)
    await new Promise((r) => setTimeout(r, 0))
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
  })

  it('erros: mensagens padrão e leitura do Retry-After', () => {
    expect(new ErroApi(404, null).message).toBe('Não encontrado.')
    expect(new ErroApi(409, null).message).toContain('mudou')
    expect(new ErroApi(500, null).message).toBe('A API respondeu com erro.')
    expect(new ErroApi(401, null).message).toContain('Entre novamente')
    expect(new ErroApi(429, null).message).toContain('Muitas tentativas')
    expect(mensagemDoErro(new ErroApi(429, null))).toContain('Muitas tentativas')
    expect(ehNaoEncontrado(new ErroApi(404, null))).toBe(true)
    expect(mensagemDoErro(new Error('x'))).toBe('Algo saiu errado. Tente novamente.')
    expect(new ErroApi(400, { mensagem: 'inválido', campos: [{ campo: 'email', mensagem: 'vazio' }] }).campos).toEqual([
      { campo: 'email', mensagem: 'vazio' },
    ])
    const cab = (v: string | null) => ({ headers: { get: () => v } })
    expect(lerRetryAfter(cab(null))).toBeNull()
    expect(lerRetryAfter(cab('abc'))).toBeNull()
    expect(lerRetryAfter(cab('30'))).toBe(30)
  })
})

describe('sessão e biometria', () => {
  it('entrar guarda token e e-mail, nunca a senha', async () => {
    simularApi({ 'POST /api/v1/auth/login': ({ corpo }) => ({ corpo: respostaLogin('TECNICO'), status: corpo ? 200 : 400 }) })
    const r = await entrar('tecnico@exemplo.test', 'segredo-123')
    expect(r.perguntarBiometria).toBe(false)
    expect(tokenAtual()).toBe('token-de-teste')
    expect(await emailLembrado()).toBe('tecnico@exemplo.test')
    expect([...guardado.values()].join(' ')).not.toContain('segredo-123')
    await esquecerEmail()
    expect(await emailLembrado()).toBe('')
  })

  it('primeiro login com biometria no aparelho pergunta uma vez', async () => {
    comBiometria(true)
    simularApi({ 'POST /api/v1/auth/login': () => ({ corpo: respostaLogin() }) })
    expect((await entrar('a@b.test', 'x')).perguntarBiometria).toBe(true)
    await gravarPreferenciaBiometria(false)
    expect((await entrar('a@b.test', 'x')).perguntarBiometria).toBe(false)
  })

  it('abrir sem token: tela de entrada; token vencido: aviso de sessão expirada', async () => {
    await abrirSessaoGuardada()
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: null })
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 't', expira_em: '2020-01-01T00:00:00Z' }))
    await abrirSessaoGuardada()
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
    expect(guardado.has(CHAVES.sessao)).toBe(false)
  })

  it('abrir com token válido e biometria desligada confere com a API e entra direto', async () => {
    const { pedidos } = simularApi({ 'GET /api/v1/auth/eu': () => ({ corpo: usuario('ADMIN') }) })
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 'guardado', expira_em: '2099-01-01T00:00:00Z' }))
    comBiometria(true)
    await abrirSessaoGuardada()
    expect(obterSessao()).toMatchObject({ fase: 'autenticada', token: 'guardado' })
    expect(pedidos[0]?.cabecalhos.get('Authorization')).toBe('Bearer guardado')
  })

  it('biometria ligada: trava e só destrava com a biometria', async () => {
    simularApi({ 'GET /api/v1/auth/eu': () => ({ corpo: usuario() }) })
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 'guardado', expira_em: '2099-01-01T00:00:00Z' }))
    await gravarPreferenciaBiometria(true)
    comBiometria(true, false)
    await abrirSessaoGuardada()
    expect(obterSessao().fase).toBe('travada')
    expect(await destravar()).toBe(false)
    expect(obterSessao().fase).toBe('travada')
    comBiometria(true, true)
    expect(await destravar()).toBe(true)
    expect(obterSessao().fase).toBe('autenticada')
  })

  it('destravar com token que venceu volta à entrada com aviso', async () => {
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 't', expira_em: '2020-01-01T00:00:00Z' }))
    expect(await destravar()).toBe(false)
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
    expect(await destravar()).toBe(false)
  })

  it('token recusado pela API ao abrir: entrada com aviso', async () => {
    simularApi({ 'GET /api/v1/auth/eu': () => erroDaApi(401, 'Token inválido.') })
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 'velho', expira_em: '2099-01-01T00:00:00Z' }))
    await abrirSessaoGuardada()
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
  })

  it('falha de rede ao abrir sobe para a tela tentar de novo', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 't', expira_em: '2099-01-01T00:00:00Z' }))
    await expect(abrirSessaoGuardada()).rejects.toBeInstanceOf(ErroRede)
    expect(obterSessao().fase).toBe('verificando')
  })

  it('sair apaga token, biometria e o que depende da sessão; fica o e-mail e o tema', async () => {
    simularApi({ 'POST /api/v1/auth/login': () => ({ corpo: respostaLogin() }) })
    await entrar('a@b.test', 'x')
    await gravarPreferenciaBiometria(true)
    guardado.set(CHAVES.tema, 'escuro')
    const limpou = jest.fn()
    aoEncerrarSessao(limpou)
    await sair()
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: null })
    expect(limpou).toHaveBeenCalledTimes(1)
    expect(await ler(CHAVES.sessao)).toBeNull()
    expect(await lerPreferenciaBiometria()).toBeNull()
    expect(await ler(CHAVES.email)).toBe('a@b.test')
    expect(await ler(CHAVES.tema)).toBe('escuro')
    expect(tokenAtual()).toBeNull()
  })

  it('a sessão encerra sozinha quando o token vence', async () => {
    jest.useFakeTimers()
    await iniciarSessao(respostaLogin('OPERADOR', new Date(Date.now() + 1000).toISOString()))
    expect(obterSessao().fase).toBe('autenticada')
    jest.advanceTimersByTime(1500)
    await Promise.resolve()
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
    jest.useRealTimers()
  })

  it('conteúdo guardado inválido é descartado', async () => {
    guardado.set(CHAVES.sessao, '{quebrado')
    expect(await lerGuardado()).toBeNull()
    guardado.set(CHAVES.sessao, JSON.stringify({ token: 1 }))
    expect(await lerGuardado()).toBeNull()
    expect(venceu({ token: 't', expira_em: 'nunca' }, 0)).toBe(true)
  })

  it('nome e disponibilidade da biometria', async () => {
    comBiometria(true)
    expect(await biometriaDisponivel()).toBe(true)
    biometria.supportedAuthenticationTypesAsync.mockResolvedValueOnce([2])
    expect(await nomeDaBiometria()).toBe('rosto')
    biometria.supportedAuthenticationTypesAsync.mockResolvedValueOnce([1, 2])
    expect(await nomeDaBiometria()).toBe('digital ou rosto')
    biometria.supportedAuthenticationTypesAsync.mockRejectedValueOnce(new Error('x'))
    expect(await nomeDaBiometria()).toBe('digital ou rosto')
    biometria.hasHardwareAsync.mockRejectedValueOnce(new Error('x'))
    expect(await biometriaDisponivel()).toBe(false)
  })

  it('encerrar duas vezes com o mesmo aviso não republica', async () => {
    await encerrarSessao('x')
    const antes = obterSessao()
    await encerrarSessao('x')
    expect(obterSessao()).toBe(antes)
  })
})

describe('consultas e ações', () => {
  beforeEach(async () => {
    await iniciarSessao(respostaLogin())
  })

  it('última janela: 404 é "nenhuma janela", não erro; com janela, guarda a idade', async () => {
    simularApi({})
    expect(await rodar(consultaUltimaJanela(1, false))).toBeNull()
    const j = janela({ A: pontoDaJanela(0.1) })
    simularApi({
      'GET /api/v1/maquinas/1/ultima-janela': ({ url }) => ({
        corpo: { ...j, janela_id: j.id, segundos_desde_recebimento: 4, simulado: url.searchParams.get('simulado') === 'true' },
      }),
    })
    const r = await rodar<{ janela: { simulado: boolean; id: number }; observacao: { idadeNaObservacaoS: number } }>(
      consultaUltimaJanela(1, true),
    )
    expect(r.janela).toMatchObject({ id: 1001, simulado: true })
    expect(r.observacao.idadeNaObservacaoS).toBe(4)
  })

  it('erro que não é 404 na última janela sobe', async () => {
    simularApi({ 'GET /api/v1/maquinas/1/ultima-janela': () => erroDaApi(500, 'falhou') })
    await expect(rodar(consultaUltimaJanela(1, false))).rejects.toBeInstanceOf(ErroApi)
  })

  it('toda consulta de dado medido leva "simulado"', async () => {
    const { pedidos } = simularApi({
      'GET /api/v1/maquinas': () => ({ corpo: { conteudo: [] } }),
      'GET /api/v1/maquinas/1/pontos': () => ({ corpo: { conteudo: [] } }),
      'GET /api/v1/maquinas/1/serie': () => ({ corpo: { intervalos: [] } }),
      'GET /api/v1/maquinas/1/avaliacao': () => ({ corpo: { pontos: [] } }),
      'GET /api/v1/alarmes/limites': () => ({ corpo: {} }),
      'GET /api/v1/alertas': () => ({ corpo: { conteudo: [] } }),
      'GET /api/v1/alertas/41': () => ({ corpo: detalhe() }),
    })
    await rodar(consultaMaquinas())
    expect(await rodar(consultaPontos(1))).toEqual([])
    await rodar(consultaSerieRecente(1, true))
    await rodar(consultaAvaliacao(1, true))
    await rodar(consultaLimites())
    await rodar(consultaAlarmes(true))
    await rodar(consultaAlarme(41))
    const comSimulado = pedidos.filter((p) => ['serie', 'avaliacao', 'alertas'].some((r) => p.caminho.endsWith(r)))
    expect(comSimulado.every((p) => p.url.searchParams.get('simulado') === 'true')).toBe(true)
    const serie = pedidos.find((p) => p.caminho.endsWith('serie'))
    expect(serie?.url.searchParams.get('baldes')).toBe('60')
  })

  it('reconhecer, suprimir e cancelar chamam as rotas certas', async () => {
    const { pedidos } = simularApi({
      'POST /api/v1/alertas/41/reconhecer': () => ({ corpo: alarme({ estado: 'ativo_reconhecido' }) }),
      'POST /api/v1/alertas/41/suprimir': () => ({ corpo: alarme({ estado: 'suprimido' }) }),
      'POST /api/v1/alertas/41/cancelar-supressao': () => ({ corpo: alarme() }),
    })
    expect((await reconhecerAlarme(41)).estado).toBe('ativo_reconhecido')
    expect((await suprimirAlarme(41, 'máquina ao lado', 60)).estado).toBe('suprimido')
    expect((await cancelarSupressao(41)).estado).toBe('ativo_nao_reconhecido')
    expect(pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toEqual([
      'POST /api/v1/alertas/41/reconhecer',
      'POST /api/v1/alertas/41/suprimir',
      'POST /api/v1/alertas/41/cancelar-supressao',
    ])
    expect(pedidos[1]?.corpo).toEqual({ motivo: 'máquina ao lado', minutos: 60 })
  })
})

describe('saúde da conexão', () => {
  it('a sonda bate no health e, quando a API volta, avisa para refazer as consultas', async () => {
    jest.useFakeTimers()
    const voltou = jest.fn()
    aoApiVoltar(voltou)
    global.fetch = jest.fn(async () => new Response('{"status":"UP"}', { status: 200 })) as unknown as typeof fetch
    registrarFalha()
    expect(obterSaude().falhandoDesdeMs).not.toBeNull()
    await jest.advanceTimersByTimeAsync(2100)
    expect(global.fetch).toHaveBeenCalledWith(`${URL_API}/actuator/health`, expect.anything())
    expect(obterSaude().falhandoDesdeMs).toBeNull()
    expect(voltou).toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('a sonda continua com espera crescente enquanto a API não responde', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn(async () => {
      throw new TypeError('fora')
    }) as unknown as typeof fetch
    registrarFalha()
    await jest.advanceTimersByTimeAsync(2100)
    expect(obterSaude().tentativa).toBe(2)
    await jest.advanceTimersByTimeAsync(3100)
    expect(obterSaude().tentativa).toBe(3)
    definirRedeDoAparelho(false)
    expect(obterSaude().aparelhoConectado).toBe(false)
    jest.useRealTimers()
  })

  it('vigia a rede do aparelho: lê o estado ao começar, segue o ouvinte e para quando pedido', async () => {
    const remover = jest.fn()
    let ouvinte: (estado: { isConnected: boolean | null }) => void = () => undefined
    jest.mocked(Network.getNetworkStateAsync).mockResolvedValueOnce({ isConnected: false } as never)
    jest.mocked(Network.addNetworkStateListener).mockImplementationOnce(((f: typeof ouvinte) => {
      ouvinte = f
      return { remove: remover }
    }) as never)
    const parar = vigiarRedeDoAparelho()
    await waitFor(() => expect(obterSaude().aparelhoConectado).toBe(false))
    // rede voltou com a API falhando: tenta o health na hora, sem esperar a sonda
    global.fetch = jest.fn(async () => new Response('{"status":"UP"}', { status: 200 })) as unknown as typeof fetch
    registrarFalha()
    ouvinte({ isConnected: true })
    expect(obterSaude().aparelhoConectado).toBe(true)
    await waitFor(() => expect(obterSaude().falhandoDesdeMs).toBeNull())
    // "não sei" (null) não é sem rede
    ouvinte({ isConnected: null })
    expect(obterSaude().aparelhoConectado).toBe(true)
    parar()
    expect(remover).toHaveBeenCalled()
  })

  it('estado da rede que não pode ser lido não derruba o vigia', async () => {
    jest.mocked(Network.getNetworkStateAsync).mockRejectedValueOnce(new Error('sem módulo'))
    const parar = vigiarRedeDoAparelho()
    await Promise.resolve()
    expect(obterSaude().aparelhoConectado).toBe(true)
    parar()
  })
})

describe('armazenamento no aparelho', () => {
  it('chave que não pode ser lida (biometria trocada) vira "sem valor", sem erro', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('chave invalidada'))
    await expect(ler(CHAVES.email)).resolves.toBeNull()
  })
})

describe('eventos ao vivo (SSE)', () => {
  function fluxo(partes: string[]) {
    const codificador = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      start(controle) {
        for (const p of partes) controle.enqueue(codificador.encode(p))
        controle.close()
      },
    })
  }

  it('lê janela, alerta e OS com o token no cabeçalho, nunca na URL', async () => {
    await iniciarSessao(respostaLogin())
    const j = janela({ A: pontoDaJanela(0.2) })
    const chamadas: { url: string; init?: RequestInit }[] = []
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init })
      return new Response(
        fluxo([
          ':batimento\n\n',
          `event: janela\ndata: ${JSON.stringify(j)}\n\n`,
          `event: alerta\ndata: ${JSON.stringify({ acao: 'abriu', alerta: alarme() })}\n\n`,
          'event: os\ndata: {"ordem":{"simulado":false}}\n\nevent: recuperacao\ndata: {}\n\nevent: modo_rapido\ndata: {}\n\nevent: x\ndata: nao-json\n\n',
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    }) as unknown as typeof fetch
    const estados: EstadoEventos[] = []
    const recebido = { janela: jest.fn(), alerta: jest.fn(), os: jest.fn(), recuperacao: jest.fn(), modo: jest.fn() }
    let cancelar = () => undefined as void
    await new Promise<void>((pronto) => {
      cancelar = assinarEventos({
        maquinaId: 1,
        simulado: true,
        aoReceberJanela: recebido.janela,
        aoReceberAlerta: recebido.alerta,
        aoReceberOrdemServico: recebido.os,
        aoReceberRecuperacao: recebido.recuperacao,
        aoReceberModoRapido: recebido.modo,
        aoMudarEstado: (e) => {
          estados.push(e)
          if (e === 'reconectando') pronto()
        },
      })
    })
    cancelar()
    expect(chamadas[0]?.url).toBe(`${URL_API}/api/v1/maquinas/1/eventos?simulado=true`)
    expect(chamadas[0]?.url).not.toContain('token')
    expect((chamadas[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste')
    expect(estados.slice(0, 2)).toEqual(['conectando', 'ao_vivo'])
    expect(recebido.janela).toHaveBeenCalledWith(j)
    expect(recebido.alerta).toHaveBeenCalledWith(expect.objectContaining({ acao: 'abriu' }))
    expect(recebido.os).toHaveBeenCalled()
    expect(recebido.recuperacao).toHaveBeenCalled()
    expect(recebido.modo).toHaveBeenCalled()
  })

  it('401 no fluxo encerra a sessão e para', async () => {
    await iniciarSessao(respostaLogin())
    global.fetch = jest.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch
    const estados: EstadoEventos[] = []
    assinarEventos({ maquinaId: 1, simulado: false, aoReceberJanela: jest.fn(), aoMudarEstado: (e) => estados.push(e) })
    await new Promise((r) => setTimeout(r, 20))
    expect(obterSessao()).toEqual({ fase: 'anonima', aviso: AVISO_SESSAO_EXPIRADA })
    expect(estados).toEqual(['conectando'])
  })

  it('sem sessão não conecta; limite de conexões respeita o Retry-After', async () => {
    const fetchSimulado = jest.fn(async () => new Response(null, { status: 429, headers: { 'Retry-After': '7' } }))
    global.fetch = fetchSimulado as unknown as typeof fetch
    assinarEventos({ maquinaId: 1, simulado: false, aoReceberJanela: jest.fn(), aoMudarEstado: jest.fn() })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchSimulado).not.toHaveBeenCalled()

    await iniciarSessao(respostaLogin())
    jest.useFakeTimers()
    const estados: EstadoEventos[] = []
    const cancelar = assinarEventos({ maquinaId: 1, simulado: false, aoReceberJanela: jest.fn(), aoMudarEstado: (e) => estados.push(e) })
    await jest.advanceTimersByTimeAsync(10)
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(6000)
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1100)
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
    cancelar()
    jest.useRealTimers()
    expect(estados).toContain('reconectando')
  })

  it('queda de rede reconecta com espera crescente', async () => {
    await iniciarSessao(respostaLogin())
    jest.useFakeTimers()
    const fetchSimulado = jest.fn(async () => {
      throw new TypeError('caiu')
    })
    global.fetch = fetchSimulado as unknown as typeof fetch
    const cancelar = assinarEventos({ maquinaId: 1, simulado: false, aoReceberJanela: jest.fn(), aoMudarEstado: jest.fn() })
    await jest.advanceTimersByTimeAsync(10)
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1000)
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(2000)
    expect(fetchSimulado).toHaveBeenCalledTimes(3)
    cancelar()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(fetchSimulado).toHaveBeenCalledTimes(3)
    jest.useRealTimers()
  })
})
