import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { consultaDiagnosticoIa } from '@/api/adaptadores/modelos'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Modulo } from '@/componentes/instrumento/Modulo'
import { formatarDataHora, formatarNumero } from '@/dominio/formato'
import { nomeDaClasse, porcento } from '@/dominio/modelos'

function Par({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-apoio">{rotulo}</dt>
      <dd className="valor min-w-0 text-texto [overflow-wrap:anywhere]">{children}</dd>
    </>
  )
}

/**
 * Diagnóstico da IA (segunda opinião): modelo ativo por tipo de dado, caminho (Java ou ONNX), se roda e por quê,
 * avisos (referência mudou...), erros de inferência, estado dos canais da fusão e da tendência e os limites novos
 * lidos da API.
 */
export function ModuloDiagnosticoIa({ maquinaId, simulado }: { maquinaId: number; simulado: boolean }) {
  const diag = useQuery(consultaDiagnosticoIa(maquinaId, simulado))
  if (diag.isPending) {
    return (
      <Modulo rotulo="Segunda opinião (IA)">
        <EstadoCarregando />
      </Modulo>
    )
  }
  if (diag.isError) {
    return (
      <Modulo rotulo="Segunda opinião (IA)">
        <EstadoErro erro={diag.error} />
      </Modulo>
    )
  }
  const d = diag.data
  const u = d.ultima_hora
  return (
    <Modulo
      rotulo="Segunda opinião (IA)"
      explica="modelo"
      simulado={simulado}
      detalhe={d.ativo ? `versão ativa v${d.ativo.versao}` : 'sem versão ativa'}
      acoes={
        <Link to="/coleta/modelos" className="text-13 underline underline-offset-4">
          Modelos
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {d.motivo_nao_roda || d.avisos.length > 0 ? (
          <ul className="flex flex-col gap-1" aria-label="Avisos da IA">
            {d.motivo_nao_roda ? (
              <li className="border border-dashed border-linha-forte px-2 py-1 text-13">
                Não roda: {d.motivo_nao_roda}
              </li>
            ) : null}
            {d.avisos.map((a) => (
              <li key={a} className="border border-dashed border-linha-forte px-2 py-1 text-13">
                {a}
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-13">
          <Par rotulo="Versão ativa">
            {d.ativo ? `v${d.ativo.versao} · ${formatarDataHora(d.ativo.ativado_em ?? d.ativo.criado_em)}` : '—'}
          </Par>
          <Par rotulo="Caminho">{d.caminho === 'java' ? 'árvores em Java' : 'ONNX Runtime'}</Par>
          <Par rotulo="Rodando">{d.roda ? 'sim' : 'não'}</Par>
          <Par rotulo="Janelas com opinião (desde que a API subiu)">{d.inferencias}</Par>
          <Par rotulo="Erros de inferência (a regra não é afetada)">{d.erros}</Par>
          {d.ultimo_erro ? <Par rotulo="Último erro">{d.ultimo_erro}</Par> : null}
          <Par rotulo="Última hora">
            {u.janelas} janelas · {u.anomalias} com anomalia
            {u.janelas > 0 ? ` (${porcento(u.anomalias / u.janelas)})` : ''}
            {Object.keys(u.por_classe).length > 0
              ? ' · ' +
                Object.entries(u.por_classe)
                  .map(([c, n]) => `${nomeDaClasse(c)} ${n}`)
                  .join(', ')
              : ''}
          </Par>
        </dl>
        <section aria-label="Limites da IA">
          <h3 className="rotulo mb-1">Limites da IA (proposta a confirmar com dado real)</h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-13">
            <Par rotulo="Limite de anomalia">percentil {formatarNumero(d.modelo.if_percentil, 0)} do normal</Par>
            <Par rotulo="Classe incerta abaixo de">{porcento(d.modelo.confianca_min)}</Par>
            <Par rotulo="Árvores e profundidade">
              IF {d.modelo.arvores_if} · RF {d.modelo.arvores_rf}, até {d.modelo.profundidade_max_rf} níveis
            </Par>
            <Par rotulo="Classe no classificador">mín. {d.treino.min_ensaios_por_classe} ensaios</Par>
            <Par rotulo="Serviço de treino">
              {d.treino.servico_configurado
                ? `configurado (espera até ${d.treino.espera_acordar_s} s para acordar)`
                : 'não configurado: comando no notebook'}
            </Par>
            <Par rotulo="Retorno da OS vira rótulo">{d.treino.usar_retorno_os ? 'sim' : 'não'}</Par>
          </dl>
        </section>
        <section aria-label="Fusão e tendência">
          <h3 className="rotulo mb-1">Próxima fase (desabilitada por configuração)</h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-13">
            {d.canais.map((c) => (
              <Par key={c.codigo} rotulo={`Canal ${c.codigo}`}>
                {c.habilitado ? 'habilitado na fusão' : 'desabilitado'}
              </Par>
            ))}
            <Par rotulo="Tendência">
              {d.tendencia_habilitada
                ? `habilitada (mín. ${d.tendencia.min_dias} dias)`
                : 'desabilitada por configuração'}
            </Par>
          </dl>
        </section>
      </div>
    </Modulo>
  )
}
