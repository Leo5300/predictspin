import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'

import { consultaAlarme } from '@/api/adaptadores/alarmes'
import { BlocoSegundaOpiniao } from '@/componentes/alarmes/SegundaOpiniao'
import { EstadoCarregando, EstadoErro } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { SeloSim } from '@/componentes/instrumento/SeloSim'
import { Explica } from '@/componentes/ui/explica'
import { formatarDataHora, formatarNumero } from '@/dominio/formato'
import { useAlarmesAoVivo } from '@/hooks/useAlarmesAoVivo'

const ROTULO_ESTADO: Record<string, string> = {
  ativo_nao_reconhecido: 'ativo, não reconhecido',
  ativo_reconhecido: 'ativo, reconhecido',
  normalizado_nao_reconhecido: 'normalizado, não reconhecido',
  encerrado: 'encerrado',
  suprimido: 'suprimido',
}

/**
 * Detalhe do alerta: estado e histórico (ISA-18.2), explicação, ação recomendada, versões, ensaio e condição,
 * segunda opinião do modelo (na abertura e a mais recente), OS e o ponto no período do alerta.
 */
export function TelaDetalheAlerta({ id }: { id: number }) {
  const consulta = useQuery(consultaAlarme(id))
  const alerta = consulta.data?.alerta
  useAlarmesAoVivo(alerta?.maquina_id, alerta?.simulado ?? false)

  useEffect(() => {
    document.title = `Alerta ${id} · PredictSpin`
  }, [id])

  if (consulta.isPending) return <EstadoCarregando />
  if (consulta.isError) return <EstadoErro erro={consulta.error} />
  const a = consulta.data.alerta
  const de = new Date(new Date(a.criado_em).getTime() - 5 * 60_000).toISOString()
  const ate = new Date(
    new Date(a.encerrado_em ?? a.normalizado_em ?? a.atualizado_em ?? a.criado_em).getTime() + 5 * 60_000,
  ).toISOString()

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link to="/alarmes" className="text-13 text-apoio underline underline-offset-4">
          Alarmes
        </Link>
        <h1 className="text-24 font-semibold">
          Alerta {a.id} · ponto {a.ponto}
        </h1>
        {a.simulado ? <SeloSim /> : null}
      </header>
      <Painel className="lg:grid-cols-2">
        <Modulo rotulo="Situação" explica="atencao_alarme">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-13">
            <dt className="text-apoio">Estado</dt>
            <dd>{ROTULO_ESTADO[a.estado] ?? a.estado}</dd>
            <dt className="text-apoio">Nível agora / pior</dt>
            <dd>
              {a.nivel} / {a.pior_nivel} · prioridade {a.prioridade}
            </dd>
            <dt className="text-apoio">Tipo</dt>
            <dd>{a.tipo === 'instrumento' ? 'instrumento (sensor)' : 'máquina'}</dd>
            <dt className="text-apoio">Medida e z</dt>
            <dd className="valor">
              {a.metrica} · z {formatarNumero(a.z, 1)} (pior {formatarNumero(a.pior_z, 1)})
            </dd>
            <dt className="text-apoio">Aberto em</dt>
            <dd className="valor">{formatarDataHora(a.criado_em)}</dd>
            <dt className="text-apoio">Componente</dt>
            <dd>{a.componente ?? '—'}</dd>
            <dt className="text-apoio">Versões</dt>
            <dd className="[overflow-wrap:anywhere]">
              referência v{a.referencia_versao ?? '—'} · firmware {a.firmware_versao ?? '—'} · calibração{' '}
              {a.calibracao ?? '—'}
            </dd>
            <dt className="text-apoio">Ensaio</dt>
            <dd>{a.ensaio_id ? `${a.ensaio_id} (${a.condicao_ensaio ?? 'normal'})` : 'uso, fora de ensaio'}</dd>
          </dl>
          <p className="mt-3 border-t border-linha-forte pt-2 text-15 font-semibold">
            <span className="rotulo mb-0.5 flex items-center gap-1">
              Ação recomendada <Explica chave="acao_recomendada" />
            </span>
            {a.acao_recomendada}
          </p>
          {a.explicacao ? <p className="mt-1 text-13 text-apoio">{a.explicacao}</p> : null}
          <p className="mt-2 flex flex-wrap gap-3 text-13">
            {a.ordem_servico_id ? (
              <Link
                to="/ordens/$osId"
                params={{ osId: String(a.ordem_servico_id) }}
                className="underline underline-offset-4"
              >
                Ordem de serviço
              </Link>
            ) : (
              <span className="text-apoio">sem OS</span>
            )}
            <Link
              to="/maquinas/$maquinaId/pontos/$codigo"
              params={{ maquinaId: a.maquina_id, codigo: a.ponto }}
              search={{ periodo: 'personalizado', de, ate, quadro: 'ordens', pagina: 0 }}
              className="underline underline-offset-4"
            >
              Ponto {a.ponto} no período do alerta
            </Link>
          </p>
        </Modulo>
        <Modulo rotulo="Segunda opinião" explica="modelo">
          <div className="flex flex-col gap-4">
            <BlocoSegundaOpiniao titulo="Na abertura" opiniao={a.opiniao_abertura} />
            <BlocoSegundaOpiniao titulo="Mais recente" opiniao={a.opiniao_recente} />
            <p className="text-12 text-apoio">
              Estimativa do modelo. Não muda estado, prioridade nem abertura do alerta: isso é da regra.
            </p>
          </div>
        </Modulo>
        <Modulo rotulo="Histórico" semRecuo className="lg:col-span-2">
          <ol aria-label="Histórico do alerta">
            {consulta.data.historico.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 border-b border-linha px-3 py-1.5 text-13 last:border-b-0">
                <span className="valor text-apoio">{formatarDataHora(h.ocorrido_em)}</span>
                <span className="font-medium">{h.acao}</span>
                <span className="text-apoio">
                  {ROTULO_ESTADO[h.estado] ?? h.estado} · {h.nivel}
                </span>
                {h.usuario ? <span className="text-apoio">por {h.usuario}</span> : null}
                {h.detalhe ? <span className="text-apoio [overflow-wrap:anywhere]">{h.detalhe}</span> : null}
              </li>
            ))}
          </ol>
        </Modulo>
      </Painel>
    </div>
  )
}
