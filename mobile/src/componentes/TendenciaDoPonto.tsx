import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { View } from 'react-native'

import { consultaTendencia, consultaTendenciaEntre } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import type { Avaliacao, Limites } from '@/api/tipos'
import { Carregando, Escolha } from '@/componentes/Basicos'
import { GraficoTendencia } from '@/componentes/GraficoTendencia'
import { Texto } from '@/componentes/Texto'
import { formatarRpm } from '@/dominio/formato'
import { faixaNormal, PERIODOS, periodo, type ChavePeriodo } from '@/dominio/tendencia'

/**
 * Tendência do RMS de um ponto com a escolha do período (15 min, 1 h, 8 h, 24 h), ou de um intervalo fixo
 * curto (a OS em volta da abertura), sem escolha. A faixa normal é a da referência que a API usou na
 * última avaliação; a legenda diz de que marcha e etapa ela é.
 */
export function TendenciaDoPonto({
  maquinaId,
  codigo,
  simulado,
  avaliacao,
  limites,
  intervalo,
  descricaoDoIntervalo,
}: {
  maquinaId: number
  codigo: string
  simulado: boolean
  avaliacao: Avaliacao | undefined
  limites: Limites | undefined
  /** Intervalo fixo (até 1 h, janelas brutas); sem ele, o período que termina agora. */
  intervalo?: { inicioS: number; fimS: number }
  descricaoDoIntervalo?: string
}) {
  const [chave, setChave] = useState<ChavePeriodo>('15min')
  // uma consulta por modo; só a do modo em uso busca
  const doPeriodo = useQuery({ ...consultaTendencia(maquinaId, simulado, chave), enabled: !intervalo })
  const doIntervalo = useQuery({
    ...consultaTendenciaEntre(maquinaId, simulado, intervalo?.inicioS ?? 0, intervalo?.fimS ?? 0),
    enabled: Boolean(intervalo),
  })
  const consulta = intervalo ? doIntervalo : doPeriodo
  const escolhido = intervalo ? { fonte: 'brutos', rotulo: '' } : periodo(chave)
  const limitesZ = limites ? { z_atencao: limites.alarme.z_atencao, z_alarme: limites.alarme.z_alarme } : null
  const avaliado = avaliacao?.pontos.find((p) => p.ponto === codigo)
  const faixa = faixaNormal(
    avaliado?.medidas.find((m) => m.medida === 'rms_g'),
    limitesZ,
  )

  const origem = [
    avaliacao?.marcha_rpm ? `marcha ${formatarRpm(avaliacao.marcha_rpm)} rpm` : null,
    avaliado?.etapa_ref ?? null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <View className="gap-3">
      {intervalo ? null : (
        <Escolha<ChavePeriodo>
          rotulo="Período da tendência"
          valor={chave}
          aoMudar={setChave}
          opcoes={PERIODOS.map((p) => ({ valor: p.chave, rotulo: p.rotulo }))}
        />
      )}
      {consulta.data ? (
        <GraficoTendencia
          tendencia={consulta.data.porPonto(codigo)}
          inicioS={consulta.data.inicioS}
          fimS={consulta.data.fimS}
          faixa={faixa}
          limitesZ={limitesZ}
          descricao={`Tendência do RMS do ponto ${codigo}, ${descricaoDoIntervalo ?? `últimos ${escolhido.rotulo}`}`}
          testID="grafico-tendencia"
        />
      ) : consulta.isError ? (
        <Texto tom="apoio">{mensagemDoErro(consulta.error)}</Texto>
      ) : (
        <Carregando texto="Carregando a tendência…" />
      )}
      <Texto tamanho="12" tom="fraco">
        {faixa
          ? `Faixa sombreada: normal da referência em uso agora${origem ? ` (${origem})` : ''}. Linhas tracejadas: atenção e alarme. ▲ atenção, ◆ alarme.`
          : 'Sem referência para este ponto agora: sem faixa normal. ▲ atenção, ◆ alarme pelo z da API.'}
        {escolhido.fonte === 'agregado'
          ? ' Em 8 h e 24 h cada traço é a média de um intervalo, e a marca aponta o intervalo que teve desvio.'
          : ''}
      </Texto>
    </View>
  )
}
