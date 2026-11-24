import { useQuery } from '@tanstack/react-query'
import { ScrollView, View } from 'react-native'

import { consultaAlarmes, consultaAvaliacao, consultaLimites, consultaPontos } from '@/api/consultas'
import { Leitura, Modulo, SeloEstado } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { SeloSim } from '@/componentes/Hachura'
import { AmostraDoPonto } from '@/componentes/Instrumento'
import { TendenciaDoPonto } from '@/componentes/TendenciaDoPonto'
import { Texto } from '@/componentes/Texto'
import { instrumentoPorPonto } from '@/dominio/alarme'
import { aparenciaDoPonto, desvioDoZ } from '@/dominio/estado'
import { formatarIdade, formatarNumero, formatarPercentual, formatarZ, TRACO } from '@/dominio/formato'
import type { Frescor } from '@/dominio/idade'
import { GRANDEZAS, rotuloDoPapel } from '@/dominio/pontos'
import { useFonte } from '@/estado/preferencias'
import { useUltimaJanela } from '@/hooks/useDadosDaMaquina'

/**
 * Detalhe do ponto: valores atuais de RMS, pico, curtose, 1X, 2X, 3X e velocidade, com o típico e o
 * z de cada medida quando a API comparou com a referência, e o estado; abaixo, a tendência do RMS.
 */
export function TelaPonto({ maquinaId, codigo }: { maquinaId: number; codigo: string }) {
  const simulado = useFonte() === 'simulado'
  const { janela, idadeS, frescor } = useUltimaJanela(maquinaId, simulado)
  const pontos = useQuery(consultaPontos(maquinaId))
  const avaliacao = useQuery(consultaAvaliacao(maquinaId, simulado))
  const limites = useQuery(consultaLimites())
  const alarmes = useQuery(consultaAlarmes(simulado))
  const cadastro = pontos.data?.find((p) => p.codigo === codigo)
  const dado = janela?.pontos[codigo]
  const frescorDoPonto: Frescor = janela && !dado ? 'ausente' : frescor
  const instrumento =
    instrumentoPorPonto((alarmes.data?.conteudo ?? []).filter((a) => a.maquina_id === maquinaId)).get(codigo) ??
    null
  const aparencia = aparenciaDoPonto(
    { frescor: frescorDoPonto, idadeS, avaliacao: dado?.avaliacao ?? null, instrumento },
    formatarIdade,
  )
  // típico e z por medida só da avaliação da mesma janela que está na tela
  const avaliado =
    avaliacao.data?.janela_id === janela?.id
      ? avaliacao.data?.pontos.find((p) => p.ponto === codigo)
      : undefined
  const limitesZ = limites.data
    ? { z_atencao: limites.data.alarme.z_atencao, z_alarme: limites.data.alarme.z_alarme }
    : null
  const apagado = aparencia.valoresApagados

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho
        titulo={`Ponto ${codigo}`}
        subtitulo={cadastro ? `${rotuloDoPapel(cadastro.papel)} · ${cadastro.descricao}` : undefined}
        voltar
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} testID="tela-ponto">
        <Modulo>
          <View className="flex-row items-center gap-3">
            <AmostraDoPonto codigo={codigo} apagado={apagado} />
            <View className="flex-1 gap-2">
              <View className="flex-row flex-wrap items-center gap-2">
                <SeloEstado
                  rotulo={aparencia.rotulo}
                  forma={aparencia.forma}
                  tom={aparencia.tom}
                  tracejado={aparencia.tracejado}
                />
                {janela?.simulado ? <SeloSim /> : null}
              </View>
              {aparencia.oQueFazer ? (
                <Texto tamanho="13" tom={apagado ? 'fraco' : 'apoio'}>
                  {aparencia.oQueFazer}
                </Texto>
              ) : null}
            </View>
          </View>
        </Modulo>
        <Modulo rotulo="Última janela">
          <View className="flex-row flex-wrap">
            {GRANDEZAS.map((g) => {
              const valor = dado?.[g.chave]
              const medida = avaliado?.medidas.find((m) => m.medida === g.chave)
              const desvio = apagado ? null : desvioDoZ(medida?.z, limitesZ)
              const texto = formatarNumero(valor, g.casas)
              return (
                <View key={g.chave} className="w-1/2 gap-0.5 border-b border-linha py-3 pr-3">
                  <Leitura
                    rotulo={g.rotulo}
                    valor={texto}
                    unidade={g.unidade || undefined}
                    tamanho="24"
                    apagado={apagado}
                    tom={desvio ?? 'texto'}
                    descricao={`${g.rotulo} ${texto} ${g.unidade}${desvio ? `, ${desvio === 'alarme' ? 'em alarme' : 'em atenção'}` : ''}`}
                  />
                  {medida ? (
                    <Texto tamanho="12" tom={apagado ? 'fraco' : 'apoio'}>
                      típico {formatarNumero(medida.tipico, g.casas)}
                      {medida.z !== null ? ` · z ${formatarZ(medida.z)}` : ''}
                      {medida.diferenca_pct !== null && medida.diferenca_pct !== undefined
                        ? ` · ${formatarPercentual(medida.diferenca_pct / 100)}`
                        : ''}
                      {desvio ? (desvio === 'alarme' ? ' · ◆ alarme' : ' · ▲ atenção') : ''}
                    </Texto>
                  ) : null}
                </View>
              )
            })}
          </View>
          <Texto tamanho="12" tom="fraco" className="mt-2">
            {janela ? `rotação ${formatarNumero(janela.rotacao_rpm, 0)} rpm · janela ${janela.modo === 'rapido' ? 'de 1 s' : 'de 5 s'}` : TRACO}
            {avaliado?.generica ? ' · referência genérica' : ''}
          </Texto>
        </Modulo>
        <Modulo rotulo="Tendência do RMS">
          <TendenciaDoPonto
            maquinaId={maquinaId}
            codigo={codigo}
            simulado={simulado}
            avaliacao={avaliacao.data}
            limites={limites.data}
          />
        </Modulo>
      </ScrollView>
    </View>
  )
}
