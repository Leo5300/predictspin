import {
  aparenciaDoAlarme,
  ehAlarmeNovo,
  emAberto,
  filtrarAlarmes,
  instrumentoPorPonto,
  nomeDaClasse,
  ordenarAlarmes,
  reconhecivel,
  resumoDaOpiniao,
  rotuloDaMedida,
  suprimivel,
  supressaoCancelavel,
  type AlarmeBasico,
} from './alarme'
import {
  esperaDaTentativaS,
  estadoDaConexao,
  indicadorDaConexao,
  statusDeApiAcordando,
  TEMPO_PARA_ACORDAR_S,
} from './conexao'
import { lerEnderecoDaApi, MENSAGEM_DO_ENDERECO } from './endereco'
import {
  aparenciaDoPonto,
  desvioDoZ,
  estadoAvaliado,
  estadoDaMaquina,
  regua,
  situacaoDoPonto,
  zMaximo,
} from './estado'
import {
  formatarCurtose,
  formatarData,
  formatarDataHora,
  formatarEspera,
  formatarG,
  formatarHaQuanto,
  formatarHora,
  formatarHoraMinuto,
  formatarIdade,
  formatarMinutos,
  formatarNumero,
  formatarPercentual,
  formatarRpm,
  formatarVelocidade,
  formatarZ,
  TRACO,
} from './formato'
import { frescor, idadeEmSegundos, limiarVelhoS } from './idade'
import { abasDoPapel, ehPapel, pode, podeVerAba, ROTULO_PAPEL } from './permissoes'
import {
  caminhosDaSparkline,
  corDoPonto,
  estiloDoPonto,
  marchaMaisProxima,
  ordenarCodigos,
  rotuloDoPapel,
  TRACO_DO_ESTILO,
} from './pontos'

describe('formatação pt-BR', () => {
  it('usa vírgula decimal e ponto de milhar', () => {
    expect(formatarNumero(1234.5678, 3)).toBe('1.234,568')
    expect(formatarNumero(0.4, 2)).toBe('0,40')
    expect(formatarNumero(-12.34, 1)).toBe('-12,3')
    expect(formatarNumero(1_000_000)).toBe('1.000.000')
  })
  it('não mostra "-0" nem NaN', () => {
    expect(formatarNumero(-0.0001, 2)).toBe('0,00')
    expect(formatarNumero(Number.NaN)).toBe(TRACO)
    expect(formatarNumero(null)).toBe(TRACO)
    expect(formatarNumero(Infinity)).toBe(TRACO)
  })
  it('formata g, rpm, curtose, velocidade, z e percentual', () => {
    expect(formatarG(0.42)).toBe('0,420')
    expect(formatarRpm(1180.4)).toBe('1180')
    expect(formatarRpm(undefined)).toBe(TRACO)
    expect(formatarCurtose(3.14159)).toBe('3,14')
    expect(formatarVelocidade(1.256)).toBe('1,26')
    expect(formatarZ(4.25)).toBe('4,3')
    expect(formatarPercentual(0.78)).toBe('78 %')
    expect(formatarPercentual(null)).toBe(TRACO)
  })
  it('formata idade, prazos e esperas', () => {
    expect(formatarIdade(8.9)).toBe('8 s')
    expect(formatarIdade(130)).toBe('2 min')
    expect(formatarIdade(7200)).toBe('2 h')
    expect(formatarIdade(200_000)).toBe('2 d')
    expect(formatarIdade(-5)).toBe('0 s')
    expect(formatarIdade(null)).toBe(TRACO)
    expect(formatarMinutos(15)).toBe('15 min')
    expect(formatarMinutos(60)).toBe('1 h')
    expect(formatarMinutos(1440)).toBe('1 dia')
    expect(formatarMinutos(10080)).toBe('7 dias')
    expect(formatarMinutos(90)).toBe('90 min')
    expect(formatarEspera(40)).toBe('40 s')
    expect(formatarEspera(180)).toBe('3 min')
    expect(formatarEspera(90)).toBe('1 min 30 s')
  })
  it('formata data dd/mm e hora local', () => {
    const d = new Date(2026, 10, 5, 9, 7, 3)
    expect(formatarHora(d)).toBe('09:07:03')
    expect(formatarHoraMinuto(d)).toBe('09:07')
    expect(formatarDataHora(d)).toBe('05/11 09:07')
    expect(formatarData(d)).toBe('05/11/2026')
    expect(formatarHora('não é data')).toBe(TRACO)
    expect(formatarDataHora(null)).toBe(TRACO)
    expect(formatarHaQuanto(d, d.getTime() + 125_000)).toBe('há 2 min')
    expect(formatarHaQuanto(undefined, 0)).toBe(TRACO)
  })
})

describe('idade do dado', () => {
  const obs = { idadeNaObservacaoS: 3, observadoEmMs: 1000 }
  it('soma a idade observada ao tempo passado no relógio monotônico', () => {
    expect(idadeEmSegundos(obs, 6000)).toBe(8)
    expect(idadeEmSegundos(obs, 500)).toBe(3)
  })
  it('passa a velho depois de 15 s (4 s no modo rápido)', () => {
    expect(frescor(null, 0, 15)).toBe('ausente')
    expect(frescor(obs, 13_000, 15)).toBe('vivo')
    expect(frescor(obs, 14_000, 15)).toBe('velho')
    expect(limiarVelhoS('rapido', true)).toBe(4)
    expect(limiarVelhoS('rapido', false)).toBe(15)
    expect(limiarVelhoS('normal', true)).toBe(15)
  })
})

describe('conexão', () => {
  it('sem rede é sem conexão; falhando há pouco é acordando; depois, sem conexão', () => {
    expect(estadoDaConexao({ aparelhoConectado: false, falhandoDesdeMs: null }, 0)).toBe('sem_conexao')
    expect(estadoDaConexao({ aparelhoConectado: true, falhandoDesdeMs: null }, 0)).toBe('ok')
    expect(estadoDaConexao({ aparelhoConectado: true, falhandoDesdeMs: 0 }, 1000)).toBe('acordando')
    expect(
      estadoDaConexao({ aparelhoConectado: true, falhandoDesdeMs: 0 }, (TEMPO_PARA_ACORDAR_S + 1) * 1000),
    ).toBe('sem_conexao')
  })
  it('espera crescente e status de proxy subindo', () => {
    expect([1, 2, 3, 6, 9].map(esperaDaTentativaS)).toEqual([2, 3, 5, 15, 15])
    expect(esperaDaTentativaS(0)).toBe(2)
    expect(statusDeApiAcordando(503)).toBe(true)
    expect(statusDeApiAcordando(500)).toBe(false)
  })
  it('indicador: só escreve com a API respondendo', () => {
    expect(indicadorDaConexao('ok', 'ao_vivo')).toEqual({ texto: 'ao vivo', tom: 'ok', podeEscrever: true })
    expect(indicadorDaConexao('ok', 'reconectando').texto).toContain('consulta a cada 5 s')
    expect(indicadorDaConexao('ok', 'conectando').podeEscrever).toBe(true)
    expect(indicadorDaConexao('acordando', 'ao_vivo').podeEscrever).toBe(false)
    expect(indicadorDaConexao('sem_conexao', 'ao_vivo')).toMatchObject({ texto: 'sem conexão', podeEscrever: false })
  })
})

describe('permissões por papel (espelho da SegurancaConfig)', () => {
  it('todos veem máquina, alarmes, OS e conta e reconhecem', () => {
    for (const papel of ['ADMIN', 'TECNICO', 'OPERADOR'] as const) {
      expect(abasDoPapel(papel)).toEqual(['maquina', 'alarmes', 'ordens', 'conta'])
      expect(pode(papel, 'reconhecer_alarme')).toBe(true)
    }
  })
  it('suprimir e cancelar supressão só ADMIN; OS ADMIN e TECNICO; coleta sem operador', () => {
    expect(pode('ADMIN', 'suprimir_alarme')).toBe(true)
    expect(pode('TECNICO', 'suprimir_alarme')).toBe(false)
    expect(pode('OPERADOR', 'cancelar_supressao')).toBe(false)
    expect(pode('TECNICO', 'concluir_os')).toBe(true)
    expect(pode('OPERADOR', 'assumir_os')).toBe(false)
    expect(podeVerAba('OPERADOR', 'coleta')).toBe(false)
    expect(podeVerAba('TECNICO', 'coleta')).toBe(true)
  })
  it('sem papel válido, nada', () => {
    expect(abasDoPapel(null)).toEqual([])
    expect(pode(undefined, 'reconhecer_alarme')).toBe(false)
    expect(ehPapel('CHEFE')).toBe(false)
    expect(ROTULO_PAPEL.TECNICO).toBe('Técnico')
  })
})

describe('endereço da API', () => {
  it('sem variável: ausente', () => {
    expect(lerEnderecoDaApi(undefined, true)).toEqual({ ok: false, motivo: 'ausente' })
    expect(lerEnderecoDaApi('  ', false)).toEqual({ ok: false, motivo: 'ausente' })
    expect(MENSAGEM_DO_ENDERECO.ausente).toContain('não configurado')
  })
  it('https vale sempre; tira a barra do fim', () => {
    expect(lerEnderecoDaApi('https://api.exemplo.test/', false)).toEqual({
      ok: true,
      url: 'https://api.exemplo.test',
      local: false,
    })
  })
  it('http só em desenvolvimento e na rede local', () => {
    expect(lerEnderecoDaApi('http://192.168.0.10:8080', true)).toMatchObject({ ok: true, local: true })
    expect(lerEnderecoDaApi('http://10.0.0.5:8080', true)).toMatchObject({ ok: true })
    expect(lerEnderecoDaApi('http://172.20.1.1:8080', true)).toMatchObject({ ok: true })
    expect(lerEnderecoDaApi('http://localhost:8080', true)).toMatchObject({ ok: true })
    expect(lerEnderecoDaApi('http://192.168.0.10:8080', false)).toEqual({ ok: false, motivo: 'sem_https' })
    expect(lerEnderecoDaApi('http://api.exemplo.test', true)).toEqual({ ok: false, motivo: 'sem_https' })
    expect(lerEnderecoDaApi('http://172.40.1.1', true)).toEqual({ ok: false, motivo: 'sem_https' })
    expect(lerEnderecoDaApi('ftp://x', true)).toEqual({ ok: false, motivo: 'invalido' })
  })
})

describe('estado da máquina e do ponto', () => {
  const idade = (s: number) => `${s} s`
  it('OPERANDO, PARADO, SEM DADOS', () => {
    expect(estadoDaMaquina('vivo', 1120)).toBe('operando')
    expect(estadoDaMaquina('vivo', 0)).toBe('parado')
    expect(estadoDaMaquina('velho', 1120)).toBe('sem_dados')
    expect(estadoDaMaquina('vivo', null)).toBe('sem_dados')
  })
  it('situação e estado vêm da API', () => {
    expect(situacaoDoPonto({ situacao: 'calibracao_diferente' })).toBe('calibracao_diferente')
    expect(situacaoDoPonto({ situacao: 'desconhecida' })).toBe('sem_referencia')
    expect(situacaoDoPonto(null)).toBe('sem_referencia')
    expect(estadoAvaliado({ situacao: 'avaliada', estado: 'alarme' })).toBe('alarme')
    expect(estadoAvaliado({ situacao: 'avaliada', estado: 'estranho' })).toBeNull()
    expect(estadoAvaliado({ situacao: 'sem_referencia', estado: 'alarme' })).toBeNull()
  })
  it('ordem de decisão: sem dados, velho, instrumento, situação, estado', () => {
    const base = { idadeS: 130, avaliacao: { situacao: 'avaliada', estado: 'alarme' }, instrumento: null }
    expect(aparenciaDoPonto({ ...base, frescor: 'ausente' }, idade).chave).toBe('sem_dados')
    const velho = aparenciaDoPonto({ ...base, frescor: 'velho' }, idade)
    expect(velho).toMatchObject({ chave: 'velho', tom: 'apagado', valoresApagados: true })
    expect(velho.oQueFazer).toContain('Sem dados há 130 s')
    const inst = aparenciaDoPonto(
      { ...base, frescor: 'vivo', instrumento: { acao_recomendada: 'Conferir a fixação do sensor B.' } },
      idade,
    )
    expect(inst).toMatchObject({ chave: 'instrumento', rotulo: 'INSTRUMENTO', forma: 'quadrado', tom: 'info' })
    expect(inst.oQueFazer).toBe('Conferir a fixação do sensor B.')
    expect(aparenciaDoPonto({ ...base, frescor: 'vivo' }, idade)).toMatchObject({
      chave: 'alarme',
      forma: 'losango',
      tom: 'alarme',
    })
  })
  it('cada situação sem avaliação diz o que fazer, neutra e tracejada', () => {
    for (const situacao of ['sem_referencia', 'sem_referencia_completa', 'calibracao_diferente', 'nao_avaliavel']) {
      const a = aparenciaDoPonto({ frescor: 'vivo', idadeS: 1, avaliacao: { situacao }, instrumento: null }, idade)
      expect(a).toMatchObject({ chave: situacao, tom: 'neutro', tracejado: true })
      expect(a.oQueFazer).toBeTruthy()
    }
  })
  it('atenção é triângulo âmbar; normal é círculo neutro; genérica avisa', () => {
    const at = aparenciaDoPonto(
      { frescor: 'vivo', idadeS: 1, avaliacao: { situacao: 'avaliada', estado: 'atencao', generica: true }, instrumento: null },
      idade,
    )
    expect(at).toMatchObject({ rotulo: 'ATENÇÃO', forma: 'triangulo', tom: 'atencao' })
    expect(at.oQueFazer).toContain('referência genérica')
    const normal = aparenciaDoPonto(
      { frescor: 'vivo', idadeS: 1, avaliacao: { situacao: 'avaliada', estado: 'normal' }, instrumento: null },
      idade,
    )
    expect(normal).toMatchObject({ rotulo: 'NORMAL', forma: 'circulo', tom: 'neutro', oQueFazer: null })
  })
  it('régua em z: centro no típico, marcas nos limites da API, tom pelo desvio', () => {
    const limites = { z_atencao: 3, z_alarme: 5 }
    const r = regua(0, limites)
    expect(r.ponteiro).toBeCloseTo(0.5)
    expect(r.marcaAtencao).toBeLessThan(r.marcaAlarme)
    expect(r.toleranciaFim - 0.5).toBeCloseTo(0.5 - r.toleranciaInicio)
    expect(regua(4, limites).tom).toBe('atencao')
    expect(regua(6, limites).tom).toBe('alarme')
    expect(regua(99, limites)).toMatchObject({ ponteiro: 1, fora: true })
    expect(regua(null, limites).ponteiro).toBeNull()
    expect(desvioDoZ(2.9, limites)).toBeNull()
    expect(desvioDoZ(3, null)).toBeNull()
    expect(zMaximo({ rms_g: 1.2, o1x: 4.5 })).toBe(4.5)
    expect(zMaximo({})).toBeNull()
    expect(zMaximo(undefined)).toBeNull()
  })
})

describe('alarmes ISA-18.2', () => {
  const a = (extra: Partial<AlarmeBasico>): AlarmeBasico => ({
    id: 1,
    estado: 'ativo_nao_reconhecido',
    nivel: 'alarme',
    prioridade: 'alta',
    tipo: 'maquina',
    criado_em: '2026-11-22T10:00:00Z',
    ...extra,
  })
  it('aparência: forma e cor pelo nível; cinza quando não está mais em desvio', () => {
    expect(aparenciaDoAlarme(a({}))).toMatchObject({ rotulo: 'ALARME', forma: 'losango', tom: 'alarme', pisca: true })
    expect(aparenciaDoAlarme(a({ nivel: 'atencao' }))).toMatchObject({ rotulo: 'ATENÇÃO', forma: 'triangulo', tom: 'atencao' })
    expect(aparenciaDoAlarme(a({ tipo: 'instrumento', nivel: 'atencao' }))).toMatchObject({
      rotulo: 'INSTRUMENTO',
      forma: 'quadrado',
      tom: 'info',
    })
    expect(aparenciaDoAlarme(a({ estado: 'normalizado_nao_reconhecido' }))).toMatchObject({
      tom: 'apagado',
      vazado: true,
      pisca: false,
    })
    expect(aparenciaDoAlarme(a({ estado: 'suprimido' }))).toMatchObject({ tom: 'apagado', riscado: true })
    expect(aparenciaDoAlarme(a({ estado: 'ativo_reconhecido' })).pisca).toBe(false)
  })
  it('ações que cabem em cada estado', () => {
    expect(reconhecivel(a({}))).toBe(true)
    expect(reconhecivel(a({ estado: 'normalizado_nao_reconhecido' }))).toBe(true)
    expect(reconhecivel(a({ estado: 'ativo_reconhecido' }))).toBe(false)
    expect(suprimivel(a({ estado: 'ativo_reconhecido' }))).toBe(true)
    expect(suprimivel(a({ estado: 'encerrado' }))).toBe(false)
    expect(supressaoCancelavel(a({ estado: 'suprimido' }))).toBe(true)
    expect(emAberto(a({ estado: 'encerrado' }))).toBe(false)
  })
  it('ordem: em aberto, prioridade alta, não reconhecido, mais novo', () => {
    const lista = [
      a({ id: 1, estado: 'encerrado', criado_em: '2026-11-22T12:00:00Z' }),
      a({ id: 2, prioridade: 'baixa', nivel: 'atencao', criado_em: '2026-11-22T11:00:00Z' }),
      a({ id: 3, estado: 'ativo_reconhecido', criado_em: '2026-11-22T11:30:00Z' }),
      a({ id: 4, criado_em: '2026-11-22T09:00:00Z' }),
      a({ id: 5, criado_em: '2026-11-22T10:00:00Z' }),
    ]
    expect(ordenarAlarmes(lista).map((x) => x.id)).toEqual([5, 4, 3, 2, 1])
    expect(filtrarAlarmes(lista, 'ativos').map((x) => x.id)).toEqual([5, 4, 3, 2])
    expect(filtrarAlarmes(lista, 'todos')).toHaveLength(5)
  })
  it('instrumento em aberto por ponto', () => {
    const mapa = instrumentoPorPonto([
      { ...a({ id: 1, tipo: 'instrumento' }), ponto: 'B', acao_recomendada: 'x' },
      { ...a({ id: 2, tipo: 'instrumento', estado: 'encerrado' }), ponto: 'C', acao_recomendada: 'y' },
      { ...a({ id: 3, tipo: 'instrumento', estado: 'normalizado_nao_reconhecido' }), ponto: 'A', acao_recomendada: 'z' },
      { ...a({ id: 4 }), ponto: 'A', acao_recomendada: 'w' },
    ])
    expect([...mapa.keys()]).toEqual(['B'])
  })
  it('textos: medida, classe e segunda opinião', () => {
    const pct = (v: number | null | undefined) => `${Math.round((v ?? 0) * 100)} %`
    expect(rotuloDaMedida('o1x')).toBe('1X')
    expect(rotuloDaMedida('nova_medida')).toBe('nova medida')
    expect(nomeDaClasse('avanco_excessivo')).toBe('avanço excessivo')
    expect(nomeDaClasse(null)).toBe('—')
    expect(nomeDaClasse('x_y')).toBe('x y')
    expect(resumoDaOpiniao({ classe: 'avanco_excessivo', confianca: 0.78, incerta: false, anomalia: true }, pct)).toBe(
      'avanço excessivo, 78 %',
    )
    expect(resumoDaOpiniao({ classe: 'desbalanceamento', confianca: 0.41, incerta: true, anomalia: true }, pct)).toContain(
      'classe incerta',
    )
    expect(resumoDaOpiniao({ classe: null, incerta: false, anomalia: false }, pct)).toBe('o modelo não vê anomalia')
    expect(resumoDaOpiniao({ classe: null, incerta: false, anomalia: true }, pct)).toBe('o modelo vê anomalia')
    expect(ehAlarmeNovo('abriu')).toBe(true)
    expect(ehAlarmeNovo('piorou')).toBe(false)
  })
})

describe('pontos', () => {
  it('estilo, cor e rótulo de cada ponto', () => {
    expect(['A', 'B', 'C', 'D'].map(estiloDoPonto)).toEqual(['continua', 'tracejada', 'pontilhada', 'continua'])
    expect(TRACO_DO_ESTILO.continua).toBeUndefined()
    expect(corDoPonto('B')).toBe('pontoB')
    expect(corDoPonto('Z')).toBe('pontoC')
    expect(rotuloDoPapel('ferramenta')).toBe('ferramenta–peça')
    expect(rotuloDoPapel('outro')).toBe('outro')
    expect(rotuloDoPapel(null)).toBe('')
    expect(ordenarCodigos(['C', 'A', 'B'])).toEqual(['A', 'B', 'C'])
  })
  it('marcha mais próxima', () => {
    expect(marchaMaisProxima(1118, [560, 1120, 1800])).toBe(1120)
    expect(marchaMaisProxima(0, [560])).toBe(0)
    expect(marchaMaisProxima(null, [560])).toBeNull()
    expect(marchaMaisProxima(500, [])).toBeNull()
  })
  it('sparkline quebra na lacuna e mostra ponto isolado', () => {
    expect(caminhosDaSparkline([], 100, 20)).toEqual([])
    expect(caminhosDaSparkline([null, null], 100, 20)).toEqual([])
    const caminhos = caminhosDaSparkline([1, 2, null, 3, null, 2], 100, 20)
    expect(caminhos).toHaveLength(3)
    expect(caminhos[0]).toMatch(/^M\S+ \S+ L/)
    expect(caminhos[2]).toMatch(/^M\S+ \S+ L/)
    expect(caminhosDaSparkline([5, 5, 5], 100, 20)[0]).toContain(' 10.0')
  })
})
