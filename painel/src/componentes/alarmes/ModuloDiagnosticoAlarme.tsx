import { useQuery } from '@tanstack/react-query'

import { consultaDiagnosticoAlarme } from '@/api/adaptadores/referencia'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Modulo } from '@/componentes/instrumento/Modulo'
import { Explica } from '@/componentes/ui/explica'
import { formatarG, formatarNumero, TRACO } from '@/dominio/formato'

function Par({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-apoio">{rotulo}</dt>
      <dd className="valor text-texto">{children}</dd>
    </div>
  )
}

/**
 * Regra de alarme no Diagnóstico: limites em uso (lidos da API, todos PROPOSTA a confirmar),
 * indicadores de desempenho das últimas 24 h e, por ponto, severidade acumulada, deriva, piso de
 * ruído e janelas com calibração diferente da referência.
 */
export function ModuloDiagnosticoAlarme({
  maquinaId,
  simulado,
}: {
  maquinaId: number
  simulado: boolean
}) {
  const diag = useQuery(consultaDiagnosticoAlarme(maquinaId, simulado))
  if (diag.isPending) {
    return (
      <Modulo rotulo="Regra de alarme">
        <EstadoCarregando />
      </Modulo>
    )
  }
  if (diag.isError) {
    return (
      <Modulo rotulo="Regra de alarme">
        <EstadoErro erro={diag.error} />
      </Modulo>
    )
  }
  const d = diag.data
  const { alarme, referencia, os } = d.limites
  return (
    <Modulo
      rotulo="Regra de alarme"
      detalhe={
        d.referencia_versao === null ? 'sem referência' : `referência versão ${d.referencia_versao}`
      }
      simulado={simulado}
      acoes={<Explica chave="atencao_alarme" />}
    >
      <div className="flex flex-col gap-4">
        {d.avisos.length > 0 ? (
          <ul className="flex flex-col gap-1" aria-label="Avisos da regra de alarme">
            {d.avisos.map((aviso) => (
              <li
                key={aviso}
                className="border border-dashed border-linha-forte px-2 py-1 text-13 text-texto"
              >
                {aviso}
              </li>
            ))}
          </ul>
        ) : null}

        <section aria-label="Limites em uso">
          <h3 className="rotulo mb-1">Limites em uso (proposta a confirmar com dado real)</h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-13 sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Par rotulo="Atenção a partir de">z {formatarNumero(alarme.z_atencao, 1)}</Par>
            <Par rotulo="Alarme a partir de">z {formatarNumero(alarme.z_alarme, 1)}</Par>
            <Par rotulo="Atraso para entrar">{formatarNumero(alarme.atraso_s, 0)} s</Par>
            <Par rotulo="Saída">
              z abaixo do limite − {formatarNumero(alarme.histerese_z, 1)} por{' '}
              {formatarNumero(alarme.saida_s, 0)} s
            </Par>
            <Par rotulo="Instrumento">{formatarNumero(alarme.instrumento_s, 0)} s</Par>
            <Par rotulo="Mínimo por célula">{referencia.min_janelas} janelas</Par>
            <Par rotulo="OS por alarme contínuo">{formatarNumero(os.alarme_continuo_s, 0)} s</Par>
            <Par rotulo="OS por severidade">{formatarNumero(os.severidade_limite, 0)} z·s</Par>
          </dl>
        </section>

        <section aria-label="Indicadores de desempenho do alarme">
          <h3 className="rotulo mb-1">Últimas 24 h (sem ensaios de condição)</h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-13">
            <Par rotulo="Alertas por hora (média)">
              {formatarNumero(d.indicadores.alertas_por_hora, 2)}
            </Par>
            <Par rotulo="Pior janela de 10 min">{d.indicadores.pior_dez_minutos}</Par>
            <Par rotulo="Repetitivos (≥ 3 em 10 min)">
              {d.indicadores.pontos_repetitivos.length > 0
                ? d.indicadores.pontos_repetitivos.join(', ')
                : 'nenhum'}
            </Par>
            <Par rotulo="Parados há mais de 24 h">{d.indicadores.parados}</Par>
            <Par rotulo="Suprimidos">{d.indicadores.suprimidos}</Par>
            <Par rotulo="Janelas sem avaliação (erro, desde que a API subiu)">
              {d.falhas_avaliacao}
            </Par>
          </dl>
          <p className="mt-1 text-12 text-apoio">
            Referência de leitura: a EEMUA 191 e a ISA-18.2 citam cerca de 6 alarmes por hora por
            operador como aceitável. Não é afirmação de conformidade.
          </p>
        </section>

        <section aria-label="Saúde por ponto" className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-13">
            <thead>
              <tr className="text-left">
                <th className="rotulo py-1 font-normal">Ponto</th>
                <th className="rotulo py-1 font-normal">
                  <span className="inline-flex items-center gap-1">
                    Severidade hoje · 7 dias · desde a OS <Explica chave="severidade" />
                  </span>
                </th>
                <th className="rotulo py-1 font-normal">
                  <span className="inline-flex items-center gap-1">
                    Deriva <Explica chave="deriva" />
                  </span>
                </th>
                <th className="rotulo py-1 font-normal">Piso de ruído</th>
                <th className="rotulo py-1 font-normal">
                  <span className="inline-flex items-center gap-1">
                    Calibração <Explica chave="calibracao_diferente" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.pontos.map((p) => (
                <tr key={p.ponto} className="border-t border-linha align-top">
                  <td className="valor py-1 font-semibold">{p.ponto}</td>
                  <td className="valor py-1">
                    {formatarNumero(p.severidade_hoje, 0)} ·{' '}
                    {formatarNumero(p.severidade_semana, 0)} ·{' '}
                    {formatarNumero(p.severidade_desde_os, 0)} z·s
                  </td>
                  <td className="valor py-1">
                    {p.deriva_pct === null
                      ? TRACO
                      : `${p.deriva_pct >= 0 ? '+' : ''}${formatarNumero(p.deriva_pct, 1)}%`}
                    <span className="block text-12 text-apoio">{p.deriva_janelas} janelas</span>
                  </td>
                  <td className="valor py-1">
                    {p.piso_ruido_rms === null ? 'não medido' : `${formatarG(p.piso_ruido_rms)} g`}
                  </td>
                  <td className="py-1">
                    {p.janelas_calibracao_diferente > 0 ? (
                      <span className="text-texto">
                        diferente em <span className="valor">{p.janelas_calibracao_diferente}</span>{' '}
                        janela(s): recalcular a referência
                      </span>
                    ) : (
                      <span className="text-apoio">igual à referência</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Modulo>
  )
}
