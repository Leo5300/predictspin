/**
 * GALERIA DE ESTADOS — só em desenvolvimento (__DEV__); fica fora do build de produção. Cada
 * componente em cada estado, nos dois temas (botão no topo), para conferir no celular em 2 minutos.
 * Os números são inventados para exercitar a tela; não são medição.
 */
import { router } from 'expo-router'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Alarme, Ensaio, ValidacaoModelo } from '@/api/tipos'
import { Botao, Leitura, Modulo, SeloEstado } from '@/componentes/Basicos'
import { GraficoTendencia } from '@/componentes/GraficoTendencia'
import { FaixaSimulado, SeloSim } from '@/componentes/Hachura'
import { PlacaEstado, ReguaDesvio, Rotacao, Sparkline } from '@/componentes/Instrumento'
import { SegurarParaConfirmar } from '@/componentes/SegurarParaConfirmar'
import { Texto } from '@/componentes/Texto'
import { porQueNaoGrava, preVoo, type Celula } from '@/dominio/coleta'
import { aparenciaDoPonto, type EntradaDoPonto } from '@/dominio/estado'
import { formatarIdade } from '@/dominio/formato'
import { resumoDoPush } from '@/dominio/notificacao'
import { faixaNormal, type Tendencia } from '@/dominio/tendencia'
import { definirTema, usePreferenciaTema } from '@/estado/preferencias'
import { LinhaDoAlarme } from '@/telas/TelaAlarmes'
import { BotaoRec, Cobertura, Fita, PreVoo, QuadroDaGravacao } from '@/telas/TelaColeta'
import { QuadroDeNotificacoes } from '@/telas/TelaConta'
import { LinhaDoPonto, type DadosDoPonto } from '@/telas/TelaMaquina'
import { Validacao } from '@/telas/TelaModelos'
import { LinhaDaOrdem } from '@/telas/TelaOrdens'
import { alarme, ordem } from '@/testes/exemplos'

export const MARCA_DA_GALERIA = 'galeria-de-estados-so-desenvolvimento'

const LIMITES = { z_atencao: 3, z_alarme: 5 }
const SERIE = [0.1, 0.11, 0.12, null, null, 0.13, 0.12, 0.14, 0.15, 0.13, 0.12, 0.16]
const TEXTO_LONGO =
  'Conferir a fixação do sensor C (ímã, superfície, cabo puxando ou solto) antes de agir na máquina; se o cabo estiver preso no barramento, soltar e passar pela calha lateral.'

function ponto(
  codigo: string,
  rms: number,
  z: number | null,
  entrada: Partial<EntradaDoPonto>,
  simulado = false,
): DadosDoPonto {
  return {
    codigo,
    papel: codigo === 'A' ? 'acionamento' : codigo === 'B' ? 'ferramenta' : 'estrutura',
    rms,
    z,
    simulado,
    serie: SERIE,
    aparencia: aparenciaDoPonto(
      { frescor: 'vivo', idadeS: 2, avaliacao: null, instrumento: null, ...entrada },
      formatarIdade,
    ),
  }
}

const PONTOS: [string, DadosDoPonto][] = [
  ['normal', ponto('A', 0.082, 0.4, { avaliacao: { situacao: 'avaliada', estado: 'normal' } })],
  ['atenção', ponto('B', 0.214, 3.6, { avaliacao: { situacao: 'avaliada', estado: 'atencao' } })],
  ['alarme', ponto('C', 0.412, 6.2, { avaliacao: { situacao: 'avaliada', estado: 'alarme', generica: true } })],
  ['sem referência', ponto('A', 0.09, null, { avaliacao: { situacao: 'sem_referencia' } })],
  ['sem referência completa', ponto('B', 0.09, null, { avaliacao: { situacao: 'sem_referencia_completa' } })],
  ['calibração diferente', ponto('C', 0.09, null, { avaliacao: { situacao: 'calibracao_diferente' } })],
  ['não avaliável', ponto('A', 15.999, null, { avaliacao: { situacao: 'nao_avaliavel' } })],
  ['dado velho', ponto('B', 0.2, 4.1, { frescor: 'velho', idadeS: 130, avaliacao: { situacao: 'avaliada', estado: 'atencao' } })],
  ['sem dados', ponto('C', 0, null, { frescor: 'ausente' })],
  ['simulado', ponto('A', 0.11, 0.8, { avaliacao: { situacao: 'avaliada', estado: 'normal' } }, true)],
  ['instrumento, texto longo', ponto('C', 0.004, null, { instrumento: { acao_recomendada: TEXTO_LONGO } })],
  ['máximo do sensor (±16 g)', ponto('B', 15.999, 99.9, { avaliacao: { situacao: 'avaliada', estado: 'alarme' } })],
]

const ALARMES: Alarme[] = [
  alarme({ id: 1 }),
  alarme({ id: 2, nivel: 'atencao', prioridade: 'baixa', estado: 'ativo_reconhecido', z: 3.4 }),
  alarme({ id: 3, estado: 'normalizado_nao_reconhecido' }),
  alarme({ id: 4, estado: 'suprimido', suprimido_ate: '2026-11-23T12:00:00Z' }),
  alarme({ id: 5, estado: 'encerrado' }),
  alarme({ id: 6, tipo: 'instrumento', nivel: 'atencao', prioridade: 'baixa', ponto: 'C', explicacao: TEXTO_LONGO }),
  alarme({ id: 7, simulado: true, z: 999.9, valor: 15.999 }),
]

const AGORA_MS = Date.parse('2026-11-24T12:30:00Z')

const ORDENS = [
  ordem({ id: 1 }),
  ordem({ id: 2, numero: 'OS-2026-0008', ponto: 'A', responsavel: 'Técnico de Teste', simulado: false }),
  ordem({
    id: 3,
    numero: 'OS-2026-0009',
    status: 'em_andamento',
    responsavel: 'Técnico de Teste',
    assumida_em: '2026-11-24T10:20:00Z',
  }),
  ordem({
    id: 4,
    numero: 'OS-2026-0010',
    status: 'concluida',
    responsavel: 'Técnico de Teste',
    retorno_tecnico: 'confirmada',
    condicao_encontrada: 'ferramenta_desgastada',
    concluida_em: '2026-11-24T11:00:00Z',
  }),
  ordem({ id: 5, numero: 'OS-2026-0011', status: 'cancelada', componente: TEXTO_LONGO }),
]

const PONTOS_ABC = ['A', 'B', 'C']
const PRE_VOO = {
  pronta: preVoo({ janela: { rotacao_rpm: 1118, pontos: { A: {}, B: {}, C: {} } }, etapa: 'T1', rotacaoAlvo: 1120, pontos: PONTOS_ABC }),
  aviso: preVoo({ janela: { rotacao_rpm: 0, pontos: { A: {}, B: {} } }, etapa: 'T3', rotacaoAlvo: 1120, pontos: PONTOS_ABC }),
  bloqueada: preVoo({ janela: null, etapa: 'T1', rotacaoAlvo: 1120, pontos: PONTOS_ABC }),
}

const ENSAIO = {
  id: 90,
  codigo: 'TORNO-01-T3-00042',
  maquina_id: 1,
  etapa: 'T3',
  condicao: 'avanco_excessivo',
  rotacao_alvo_rpm: 1120,
  repeticao: 2,
  simulado: true,
  aberto: true,
  descartado: false,
  iniciado_em: '2026-11-24T12:00:00Z',
  encerrado_em: null,
} as Ensaio

const TRACOS = Array.from({ length: 40 }, (_, i) => ({ id: i, saturou: i === 17 || i === 18 || i === 33 }))

const GRADE: Celula[] = [
  { etapa: 'T0', condicao: 'normal', rotacao: 0, uso: 'treino', validos: 3, meta: 3, faltam: 0 },
  { etapa: 'T1', condicao: 'normal', rotacao: 560, uso: 'treino', validos: 2, meta: 3, faltam: 1 },
  { etapa: 'T1', condicao: 'normal', rotacao: 1120, uso: 'treino', validos: 0, meta: 3, faltam: 3 },
  { etapa: 'T3', condicao: 'avanco_excessivo', rotacao: 1120, uso: 'validacao', validos: 1, meta: 3, faltam: 2 },
]

/** 15 min de janelas de 5 s com um buraco de 2 min no meio e um trecho em atenção e outro em alarme. */
const INICIO_S = AGORA_MS / 1000 - 900
const TENDENCIA: Tendencia = {
  fonte: 'brutos',
  passoS: 5,
  janelas: 156,
  amostras: Array.from({ length: 180 }, (_, i) => {
    const t = INICIO_S + i * 5
    if (i >= 70 && i < 94) return { t, valor: null, z: null }
    const z = i > 150 && i < 160 ? 3.6 : i >= 160 && i < 166 ? 5.4 : 0.3 * Math.sin(i / 7)
    return { t, valor: 0.1 + z * 0.01, z }
  }),
}
const FAIXA = faixaNormal({ tipico: 0.1, sigma_efetivo: 0.01 }, LIMITES)

const SEM_METRICAS = {
  aplicavel: false,
  k: null,
  dias: null,
  janelas_testadas: 0,
  motivo: 'Menos de 2 dias com ensaios: a validação por dia não se aplica.',
  classificador: null,
  comparacao: null,
} as unknown as ValidacaoModelo

const NOTIFICACOES = [
  ['indisponível (Expo Go)', resumoDoPush({ fase: 'indisponivel', motivo: 'expo_go' }, 'TECNICO')],
  ['desligada', resumoDoPush({ fase: 'desligado', podePedir: true, oferecer: true }, 'TECNICO')],
  ['negada no sistema', resumoDoPush({ fase: 'desligado', podePedir: false, oferecer: false }, 'TECNICO')],
  ['ligada', resumoDoPush({ fase: 'registrado', envioHabilitado: true }, 'TECNICO')],
  ['API com o envio desligado', resumoDoPush({ fase: 'registrado', envioHabilitado: false }, 'TECNICO')],
  ['falhou', resumoDoPush({ fase: 'falhou', onde: 'api' }, 'TECNICO')],
] as const

const nada = () => undefined

export function Galeria() {
  const tema = usePreferenciaTema()
  const insets = useSafeAreaInsets()
  return (
    <View className="flex-1 bg-fundo" style={{ paddingTop: insets.top }} testID={MARCA_DA_GALERIA}>
      <View className="flex-row gap-2 border-b border-linha px-4 py-2">
        <View className="flex-1">
          <Botao titulo={tema === 'escuro' ? 'Tema: escuro' : 'Tema: claro'} onPress={() => void definirTema(tema === 'escuro' ? 'claro' : 'escuro')} />
        </View>
        <View className="flex-1">
          <Botao titulo="Fechar" onPress={() => router.back()} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Modulo rotulo="Placa e rotação">
          <View className="gap-3">
            <PlacaEstado estado="operando" />
            <PlacaEstado estado="parado" />
            <PlacaEstado estado="sem_dados" />
            <View className="flex-row justify-between">
              <Rotacao rpm={1118} vivo marcha={1120} />
              <Rotacao rpm={99999} vivo={false} marcha={null} />
            </View>
          </View>
        </Modulo>
        <Modulo rotulo="Selos">
          <View className="flex-row flex-wrap gap-2">
            <SeloEstado rotulo="NORMAL" forma="circulo" tom="neutro" />
            <SeloEstado rotulo="ATENÇÃO" forma="triangulo" tom="atencao" />
            <SeloEstado rotulo="ALARME" forma="losango" tom="alarme" />
            <SeloEstado rotulo="INSTRUMENTO" forma="quadrado" tom="info" />
            <SeloEstado rotulo="SEM REFERÊNCIA" forma="circulo" tom="neutro" tracejado />
            <SeloEstado rotulo="DADO VELHO" forma="anel" tom="apagado" tracejado />
            <SeloSim />
          </View>
        </Modulo>
        <FaixaSimulado />
        <Modulo rotulo="Régua, leitura e sparkline">
          <View className="gap-3">
            <ReguaDesvio z={0.5} limites={LIMITES} />
            <ReguaDesvio z={3.8} limites={LIMITES} />
            <ReguaDesvio z={42} limites={LIMITES} />
            <ReguaDesvio z={1} limites={null} />
            <Leitura rotulo="RMS" valor="15,999" unidade="g" tamanho="40" />
            <Leitura rotulo="PICO" valor="0,412" unidade="g" apagado />
            <Sparkline valores={SERIE} codigo="B" />
          </View>
        </Modulo>
        {PONTOS.map(([nome, p]) => (
          <View key={nome}>
            <Texto rotulo className="px-4 pt-4">
              {nome}
            </Texto>
            <LinhaDoPonto ponto={p} limites={LIMITES} />
          </View>
        ))}
        <Texto rotulo className="px-4 pt-6">
          Alarmes
        </Texto>
        {ALARMES.map((a) => (
          <LinhaDoAlarme key={a.id} alarme={a} agoraMs={Date.parse('2026-11-22T12:30:00Z')} />
        ))}
        <Texto rotulo className="px-4 pt-6">
          Ordens de serviço: aberta sem dono, aberta com dono, em andamento, concluída, cancelada
        </Texto>
        {ORDENS.map((o) => (
          <LinhaDaOrdem key={o.id} ordem={o} agoraMs={AGORA_MS} />
        ))}
        <Modulo rotulo="Coleta: pré-voo pronto">
          <PreVoo itens={PRE_VOO.pronta} janelaId={1} />
          <BotaoRec aoGravar={nada} motivo={porQueNaoGrava(PRE_VOO.pronta, false)} ocupado={false} />
        </Modulo>
        <Modulo rotulo="Coleta: pré-voo com avisos (grava)">
          <PreVoo itens={PRE_VOO.aviso} janelaId={2} />
          <BotaoRec aoGravar={nada} motivo={porQueNaoGrava(PRE_VOO.aviso, false)} ocupado={false} />
        </Modulo>
        <Modulo rotulo="Coleta: bloqueada (sem dado vivo)">
          <PreVoo itens={PRE_VOO.bloqueada} janelaId={null} />
          <BotaoRec aoGravar={nada} motivo={porQueNaoGrava(PRE_VOO.bloqueada, false)} ocupado={false} />
        </Modulo>
        <Modulo rotulo="Coleta: abrindo o ensaio">
          <BotaoRec aoGravar={nada} motivo={null} ocupado />
        </Modulo>
        <Texto rotulo className="px-4 pt-6">
          Coleta: gravando, com janelas saturadas
        </Texto>
        <QuadroDaGravacao ensaio={ENSAIO} segundos={3725} resumo={{ janelas: 745, janelas_saturadas: 3 }} />
        <Fita tracos={TRACOS} />
        <Modulo rotulo="Cobertura (célula carimbada)">
          <Cobertura grade={GRADE} carimbo="T1|normal|560" />
        </Modulo>
        <Modulo rotulo="Tendência com buraco de dado">
          <GraficoTendencia
            tendencia={TENDENCIA}
            inicioS={INICIO_S}
            fimS={INICIO_S + 900}
            faixa={FAIXA}
            limitesZ={LIMITES}
            descricao="Tendência do RMS do ponto B, últimos 15 min"
          />
        </Modulo>
        <Validacao titulo="Modelo sem métricas (por dia)" v={SEM_METRICAS} />
        {NOTIFICACOES.map(([nome, resumo]) => (
          <View key={nome}>
            <Texto rotulo className="px-4 pt-4">
              Notificações: {nome}
            </Texto>
            <QuadroDeNotificacoes resumo={resumo} ocupado={false} aoLigar={nada} aoTentar={nada} />
          </View>
        ))}
        <Modulo rotulo="Ações">
          <View className="gap-3">
            <SegurarParaConfirmar titulo="Segure para reconhecer" aoConfirmar={() => undefined} />
            <SegurarParaConfirmar titulo="Segure para reconhecer" desabilitado aoConfirmar={() => undefined} />
            <Botao titulo="Entrar" variante="acao" />
            <Botao titulo="Suprimir…" />
            <Botao titulo="Desabilitado" desabilitado />
            <Botao titulo="Carregando" carregando />
          </View>
        </Modulo>
      </ScrollView>
    </View>
  )
}
