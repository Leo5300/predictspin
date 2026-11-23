/**
 * Exemplos com a forma do contrato, para testes e para a galeria de estados (só em desenvolvimento).
 * Os números são inventados para exercitar a tela; não são medição.
 */
import type { Alarme, AlarmeDetalhe, Janela, JanelaPonto, Maquina, Ponto, RespostaLogin, Usuario } from '@/api/tipos'

export function usuario(papel: Usuario['papel'] = 'OPERADOR'): Usuario {
  return {
    id: 7,
    nome: 'Operador de Teste',
    email: 'operador@exemplo.test',
    papel,
    ativo: true,
    criado_em: '2026-11-01T10:00:00Z',
  }
}

export function respostaLogin(papel: Usuario['papel'] = 'OPERADOR', expiraEm?: string): RespostaLogin {
  return {
    token: 'token-de-teste',
    tipo: 'Bearer',
    expira_em: expiraEm ?? new Date(Date.now() + 3_600_000).toISOString(),
    usuario: usuario(papel),
  }
}

export const MAQUINA: Maquina = {
  id: 1,
  codigo: 'TORNO-01',
  modelo: 'ROMI Tormax 30',
  fabricante: 'ROMI',
  classe: 'torno',
  ativa: true,
  data_instalacao: null,
  local: { id: 1, nome: 'Oficina' } as Maquina['local'],
  rotacoes_nominais_rpm: [90, 180, 355, 560, 1120, 1800],
  rotacoes_coleta_rpm: [],
}

export const PONTOS: Ponto[] = [
  { id: 1, codigo: 'A', papel: 'acionamento', descricao: 'cabeçote', fixacao: null, ativo: true },
  { id: 2, codigo: 'B', papel: 'ferramenta', descricao: 'carro', fixacao: null, ativo: true },
  { id: 3, codigo: 'C', papel: 'estrutura', descricao: 'barramento', fixacao: null, ativo: true },
]

type AvaliacaoDoPonto = JanelaPonto['avaliacao']

export function pontoDaJanela(rms: number, avaliacao?: AvaliacaoDoPonto, papel = 'acionamento'): JanelaPonto {
  return {
    ponto_id: 1,
    papel,
    descricao: '',
    rms_g: rms,
    pico_g: rms * 3,
    curtose: 3.1,
    o1x: rms / 2,
    o2x: rms / 4,
    o3x: rms / 8,
    vel_rms_mm_s: 1.25,
    avaliacao,
  }
}

export function avaliada(estado: 'normal' | 'atencao' | 'alarme', z: number, generica = false): AvaliacaoDoPonto {
  return { situacao: 'avaliada', estado, z: { rms_g: z }, etapa_ref: 'T1', generica }
}

export function semReferencia(situacao = 'sem_referencia'): AvaliacaoDoPonto {
  return { situacao, estado: null, z: {}, etapa_ref: null, generica: false }
}

export function janela(pontos: Record<string, JanelaPonto>, extra: Partial<Janela> = {}): Janela {
  return {
    id: 1001,
    medido_em: '2026-11-22T12:00:00Z',
    recebido_em: '2026-11-22T12:00:01Z',
    rotacao_rpm: 1118,
    saturou: false,
    modo: 'normal',
    amostras: 3200,
    amostras_esperadas: 3200,
    simulado: false,
    dispositivo: 'ps-esp32-01',
    ensaio_id: null,
    ensaio_codigo: null,
    pontos,
    canais: {},
    ...extra,
  }
}

export function alarme(extra: Partial<Alarme> = {}): Alarme {
  return {
    id: 41,
    maquina: 'TORNO-01',
    maquina_id: 1,
    ponto: 'B',
    tipo: 'maquina',
    estado: 'ativo_nao_reconhecido',
    nivel: 'alarme',
    pior_nivel: 'alarme',
    prioridade: 'alta',
    metrica: 'rms_g',
    valor: 0.412,
    z: 5.6,
    pior_z: 6.1,
    explicacao: 'B·RMS 5,6σ acima do típico da marcha 1120.',
    acao_recomendada:
      'Conferir o estado da ferramenta (desgaste ou lasca) e reduzir o avanço ou a profundidade de corte.',
    componente: 'ferramenta e porta-ferramenta',
    criado_em: '2026-11-22T11:58:00Z',
    atualizado_em: null,
    normalizado_em: null,
    encerrado_em: null,
    reconhecido_em: null,
    reconhecido_por: null,
    suprimido_ate: null,
    suprimido_por: null,
    motivo_supressao: null,
    janela_id: 1001,
    ensaio_id: null,
    condicao_ensaio: null,
    durante_ensaio_de_condicao: false,
    calibracao: null,
    firmware_versao: null,
    referencia_versao: 3,
    ordem_servico_id: null,
    opiniao_abertura: null,
    opiniao_recente: null,
    simulado: false,
    ...extra,
  }
}

export function detalhe(a: Alarme = alarme()): AlarmeDetalhe {
  return {
    alerta: a,
    historico: [
      {
        acao: 'abriu',
        estado: 'ativo_nao_reconhecido',
        nivel: a.nivel,
        ocorrido_em: a.criado_em,
        usuario: null,
        detalhe: null,
      },
    ],
  }
}

export const LIMITES = {
  alarme: {
    z_atencao: 3,
    z_alarme: 5,
    atraso_s: 15,
    histerese_z: 1,
    saida_s: 15,
    instrumento_s: 30,
    sinal_fracao: 0.5,
    indicadores_h: 24,
    rajada_min: 10,
    repetitivo_vezes: 3,
    parado_h: 24,
    supressao_max_min: 10080,
    supressao_opcoes_min: [15, 60, 240, 1440],
  },
}
