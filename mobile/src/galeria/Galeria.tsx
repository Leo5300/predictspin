/**
 * GALERIA DE ESTADOS — só em desenvolvimento (__DEV__); fica fora do build de produção. Cada
 * componente em cada estado, nos dois temas (botão no topo), para conferir no celular em 2 minutos.
 * Os números são inventados para exercitar a tela; não são medição.
 */
import { router } from 'expo-router'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Alarme } from '@/api/tipos'
import { Botao, Leitura, Modulo, SeloEstado } from '@/componentes/Basicos'
import { FaixaSimulado, SeloSim } from '@/componentes/Hachura'
import { PlacaEstado, ReguaDesvio, Rotacao, Sparkline } from '@/componentes/Instrumento'
import { SegurarParaConfirmar } from '@/componentes/SegurarParaConfirmar'
import { Texto } from '@/componentes/Texto'
import { aparenciaDoPonto, type EntradaDoPonto } from '@/dominio/estado'
import { formatarIdade } from '@/dominio/formato'
import { definirTema, usePreferenciaTema } from '@/estado/preferencias'
import { LinhaDoAlarme } from '@/telas/TelaAlarmes'
import { LinhaDoPonto, type DadosDoPonto } from '@/telas/TelaMaquina'
import { alarme } from '@/testes/exemplos'

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
