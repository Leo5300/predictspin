import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  chavesReferencia,
  consultaReferencia,
  recalcularReferencia,
  type VersaoReferencia,
} from '@/api/adaptadores/referencia'
import { mensagemDoErro } from '@/api/erros'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Modulo } from '@/componentes/instrumento/Modulo'
import { Button } from '@/componentes/ui/button'
import { Explica } from '@/componentes/ui/explica'
import { formatarDataHora } from '@/dominio/formato'
import { cn } from '@/lib/utils'

const ROTULO_MOTIVO: Record<string, string> = {
  saturou: 'saturou',
  modo_rapido: 'modo rápido (1 s)',
  amostras_faltando: 'amostras faltando',
  fora_da_marcha: 'rotação fora da marcha',
  ordens_zeradas: 'ordens zeradas (troca de marcha)',
  ensaio_descartado: 'ensaio descartado',
  condicao_nao_normal: 'condição diferente de normal',
  etapa_t2: 'T2 (usa a referência do T1)',
  calibracao_antiga: 'calibração antiga (janela×ponto)',
}

const ROTULO_COBERTURA: Record<string, string> = {
  com: 'com referência',
  insuficiente: 'insuficiente',
  sem: 'sem gravação',
}

function Versao({ versao }: { versao: VersaoReferencia }) {
  const excluidas = Object.entries(versao.excluidas).sort((a, b) => b[1] - a[1])
  return (
    <div className="flex flex-col gap-1 text-13 text-texto">
      <span>
        versão <span className="valor font-semibold">{versao.numero}</span> de{' '}
        <span className="valor">{formatarDataHora(versao.criada_em)}</span>
        {versao.autor ? <> por {versao.autor}</> : null}
      </span>
      <span className="text-apoio">
        <span className="valor text-texto">{versao.janelas_usadas}</span> janelas de ensaio e{' '}
        <span className="valor text-texto">{versao.janelas_deriva}</span> de uso normal ·{' '}
        <span className="valor text-texto">{versao.celulas_suficientes}</span> de{' '}
        <span className="valor">{versao.celulas}</span> células com janelas suficientes
      </span>
      {excluidas.length > 0 ? (
        <span className="text-apoio">
          excluídas:{' '}
          {excluidas.map(([motivo, n], i) => (
            <span key={motivo}>
              {i > 0 ? ' · ' : null}
              {ROTULO_MOTIVO[motivo] ?? motivo} <span className="valor text-texto">{n}</span>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Referência aprendida da máquina na Coleta: a versão em uso, o botão "Recalcular referência" (gera
 * uma versão nova e guarda a anterior) e a cobertura por marcha e etapa.
 */
export function ModuloReferencia({
  maquinaId,
  simulado,
}: {
  maquinaId: number
  simulado: boolean
}) {
  const cliente = useQueryClient()
  const referencia = useQuery(consultaReferencia(maquinaId, simulado))
  const recalcular = useMutation({
    mutationFn: () => recalcularReferencia(maquinaId, simulado),
    onSuccess: (versao) => {
      toast(`Referência recalculada: versão ${versao.numero}.`)
      void cliente.invalidateQueries({ queryKey: chavesReferencia.referencia(maquinaId, simulado) })
      void cliente.invalidateQueries({ queryKey: chavesReferencia.avaliacao(maquinaId, simulado) })
      void cliente.invalidateQueries({
        queryKey: chavesReferencia.diagnostico(maquinaId, simulado),
      })
    },
    onError: (erro) => toast(mensagemDoErro(erro)),
  })
  const dados = referencia.data
  const marchas = [...new Set((dados?.cobertura ?? []).map((c) => c.marcha_rpm))]
  const celula = (marcha: number, etapa: string) =>
    dados?.cobertura.find((c) => c.marcha_rpm === marcha && c.etapa === etapa)

  return (
    <Modulo
      rotulo="Referência"
      simulado={simulado}
      acoes={
        <span className="flex items-center gap-2">
          <Explica chave="referencia" />
          <Button size="sm" onClick={() => recalcular.mutate()} disabled={recalcular.isPending}>
            {recalcular.isPending ? 'Recalculando…' : 'Recalcular referência'}
          </Button>
        </span>
      }
    >
      {referencia.isPending ? (
        <EstadoCarregando />
      ) : referencia.isError ? (
        <EstadoErro erro={referencia.error} />
      ) : (
        <div className="flex flex-col gap-3">
          {dados?.versao ? (
            <Versao versao={dados.versao} />
          ) : (
            <p className="text-13 text-apoio">
              Ainda não há referência calculada. Grave ensaios normais de T0, T1 e T3 e recalcule.
            </p>
          )}
          {dados && !dados.piso_ruido_medido ? (
            <p className="text-13 text-apoio">
              Sem piso de ruído medido: falta um ensaio T0 (torno desligado com a oficina
              funcionando).
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table
              className="w-full table-fixed text-13 [overflow-wrap:anywhere]"
              aria-label="Cobertura da referência por marcha e etapa"
            >
              <thead>
                <tr className="text-left">
                  <th className="rotulo py-1 font-normal">Marcha</th>
                  <th className="rotulo py-1 font-normal">T0</th>
                  <th className="rotulo py-1 font-normal">T1</th>
                  <th className="rotulo py-1 font-normal">T3</th>
                </tr>
              </thead>
              <tbody>
                {marchas.map((marcha) => (
                  <tr key={marcha} className="border-t border-linha">
                    <td className="valor py-1">{marcha === 0 ? 'parado' : `${marcha} rpm`}</td>
                    {['T0', 'T1', 'T3'].map((etapa) => {
                      const c = celula(marcha, etapa)
                      return (
                        <td
                          key={etapa}
                          className="py-1"
                          data-cobertura={c?.situacao ?? 'nao_se_aplica'}
                        >
                          {c ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1',
                                c.situacao === 'com' ? 'text-texto' : 'text-apoio',
                              )}
                            >
                              <span aria-hidden="true">
                                {c.situacao === 'com'
                                  ? '■'
                                  : c.situacao === 'insuficiente'
                                    ? '◧'
                                    : '□'}
                              </span>
                              {ROTULO_COBERTURA[c.situacao]}
                            </span>
                          ) : (
                            <span className="text-fraco">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modulo>
  )
}
