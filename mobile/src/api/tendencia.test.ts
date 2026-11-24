import { QueryClient } from '@tanstack/react-query'

import { simularApi } from '@/testes/ajudantes'
import { janela, pontoDaJanela } from '@/testes/exemplos'

import { consultaTendencia } from './consultas'
import { reiniciarSaudeParaTeste } from './saude'

// sem gcTime infinito, o cache deixa um temporizador de 5 min vivo e o Jest não termina
const cliente = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })

afterEach(() => reiniciarSaudeParaTeste())

describe('consulta da tendência', () => {
  it('15 min: janelas normais da mais antiga para a mais nova, página a página, com "simulado"', async () => {
    const instante = (s: number) => new Date(Date.parse('2026-11-24T10:00:00Z') + s * 1000).toISOString()
    const pagina = (n: number) => ({
      conteudo: [janela({ B: pontoDaJanela(0.1 + n / 10) }, { id: n, medido_em: instante(n * 5) })],
      pagina: n,
      tamanho: 200,
      total_elementos: 3,
      total_paginas: 3,
    })
    const { pedidos } = simularApi({
      'GET /api/v1/maquinas/1/janelas': ({ url }) => ({ corpo: pagina(Number(url.searchParams.get('page'))) }),
    })
    const antes = Date.now() / 1000
    const dados = await cliente().fetchQuery(consultaTendencia(1, true, '15min'))

    expect(pedidos.map((p) => p.url.searchParams.get('page'))).toEqual(['0', '1', '2'])
    const consulta = pedidos[0]!.url.searchParams
    expect(consulta.get('simulado')).toBe('true')
    expect(consulta.get('modo')).toBe('normal')
    expect(consulta.get('ordem')).toBe('asc')
    expect(consulta.get('size')).toBe('200')
    expect(dados.fimS - dados.inicioS).toBeCloseTo(15 * 60, 3)
    expect(dados.fimS).toBeGreaterThanOrEqual(antes)
    expect(dados.porPonto('B').amostras.map((a) => a.valor)).toEqual([0.1, 0.2, 0.30000000000000004])
  })

  it('24 h: uma chamada à série agregada com 576 intervalos', async () => {
    const { pedidos } = simularApi({
      'GET /api/v1/maquinas/1/serie': () => ({
        corpo: {
          maquina_id: 1,
          de: '2026-11-23T10:00:00Z',
          ate: '2026-11-24T10:00:00Z',
          baldes: 576,
          segundos_por_balde: 150,
          simulado: false,
          pontos: ['B'],
          intervalos: [
            {
              indice: 0,
              inicio: '2026-11-23T10:00:00Z',
              fim: '2026-11-23T10:02:30Z',
              janelas: 30,
              rotacao_media_rpm: 1120,
              saturou: false,
              pontos: { B: { rms_media_g: 0.2, rms_max_g: 0.3, pico_max_g: 0.9, curtose_media: 3 } },
            },
          ],
        },
      }),
    })
    const dados = await cliente().fetchQuery(consultaTendencia(1, false, '24h'))
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]!.url.searchParams.get('baldes')).toBe('576')
    expect(pedidos[0]!.url.searchParams.get('simulado')).toBe('false')
    expect(dados.porPonto('B')).toMatchObject({ fonte: 'agregado', janelas: 30 })
  })
})
