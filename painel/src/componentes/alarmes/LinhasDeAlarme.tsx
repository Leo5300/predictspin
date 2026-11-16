import { Check, X } from 'lucide-react'

import type { Alarme, EstadoAlarme, OrdemServico } from '@/api/adaptadores/alarmes'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { formatarDataHora, formatarNumero } from '@/dominio/formato'
import { cn } from '@/lib/utils'

const ROTULO_ESTADO: Record<EstadoAlarme, string> = {
  nao_reconhecido: 'não reconhecido',
  reconhecido: 'reconhecido',
  normalizado_sem_reconhecimento: 'normalizou sem reconhecimento',
  suprimido: 'suprimido',
}

/**
 * Ícone do alarme pela prioridade: losango (alarme) ou triângulo (atenção), preenchido na cor da
 * prioridade. Não reconhecido: só o ícone pisca devagar; com movimento reduzido, um anel parado em
 * volta do ícone ocupa o lugar do piscar. Normalizado sem reconhecimento: ícone vazado. Suprimido:
 * ícone cinza riscado.
 */
function IconeDoAlarme({ prioridade, estado }: Pick<Alarme, 'prioridade' | 'estado'>) {
  const cor =
    estado === 'suprimido'
      ? 'var(--texto-fraco)'
      : prioridade === 'alarme'
        ? 'var(--estado-alarme)'
        : 'var(--estado-atencao)'
  const vazado = estado === 'normalizado_sem_reconhecimento'
  const forma = prioridade === 'alarme' ? 'M8 1 15 8 8 15 1 8Z' : 'M8 1.5 15 14.5H1Z'
  return (
    <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
      {estado === 'nao_reconhecido' ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 hidden rounded-full border-2 motion-reduce:block"
          style={{ borderColor: cor }}
        />
      ) : null}
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={cn(
          'size-4',
          estado === 'nao_reconhecido' && 'motion-safe:animate-[piscar-lento_2s_linear_infinite]',
        )}
      >
        <path d={forma} fill={vazado ? 'none' : cor} stroke={cor} strokeWidth={vazado ? 2 : 1} />
        {estado === 'suprimido' ? (
          <path d="M2 14 14 2" stroke="var(--texto)" strokeWidth={1.5} />
        ) : null}
      </svg>
    </span>
  )
}

/** Linha de alarme (ISA-18.2): prioridade e estado em forma, cor e texto; ação recomendada sempre. */
export function LinhaAlarme({
  alarme,
  aoReconhecer,
}: {
  alarme: Alarme
  aoReconhecer?: (id: number) => void
}) {
  const prioridade = alarme.prioridade === 'alarme' ? 'ALARME' : 'ATENÇÃO'
  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-linha px-3 py-2 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      data-estado={alarme.estado}
    >
      <IconeDoAlarme prioridade={alarme.prioridade} estado={alarme.estado} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 text-15 text-texto">
          <span
            className={cn(
              'text-12 font-semibold tracking-[0.08em]',
              alarme.estado === 'suprimido'
                ? 'text-apoio'
                : alarme.prioridade === 'alarme'
                  ? 'text-alarme-texto'
                  : 'text-atencao-texto',
            )}
          >
            {prioridade}
          </span>
          <span className="valor font-semibold">{alarme.maquina}</span>
          <span>
            {alarme.origem} · {alarme.metrica}{' '}
            <span className="valor">{formatarNumero(alarme.valor, 3)}</span> {alarme.unidade}
          </span>
        </span>
        <span className="text-13 text-apoio">
          {ROTULO_ESTADO[alarme.estado]} ·{' '}
          <span className="valor">{formatarDataHora(alarme.ocorridoEm)}</span>
        </span>
        <p className="mt-1 border-l-0 bg-rebaixo px-2 py-1.5 text-15 text-texto">
          <span className="rotulo mr-2">Ação recomendada</span>
          {alarme.acaoRecomendada}
        </p>
      </div>
      {alarme.estado === 'nao_reconhecido' || alarme.estado === 'normalizado_sem_reconhecimento' ? (
        <SegurarParaConfirmar
          className="col-span-2 justify-self-start sm:col-span-1 sm:self-start"
          aoConfirmar={() => aoReconhecer?.(alarme.id)}
        >
          Segure para reconhecer
        </SegurarParaConfirmar>
      ) : null}
    </li>
  )
}

const ROTULO_STATUS: Record<OrdemServico['status'], string> = {
  aberta: 'aberta',
  em_andamento: 'em andamento',
  concluida: 'concluída',
  cancelada: 'cancelada',
}

/** Linha de ordem de serviço: ação recomendada em destaque e o retorno do técnico. */
export function LinhaOrdemServico({ ordem }: { ordem: OrdemServico }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-linha px-3 py-2 last:border-b-0">
      <span className="flex flex-wrap items-baseline gap-x-3 text-13 text-apoio">
        <span className="valor text-15 font-semibold text-texto">{ordem.numero}</span>
        <span className="valor">{ordem.maquina}</span>
        <span>{ordem.tipoFalha}</span>
        <span className="border border-linha-forte px-1 text-12 tracking-[0.06em] text-texto uppercase">
          {ROTULO_STATUS[ordem.status]}
        </span>
        <span>
          aberta em <span className="valor">{formatarDataHora(ordem.abertaEm)}</span>
        </span>
      </span>
      <p className="border border-linha-forte bg-rebaixo px-2.5 py-2 text-18 font-semibold text-texto">
        <span className="rotulo mb-0.5 block">Ação recomendada</span>
        {ordem.acaoRecomendada}
      </p>
      <span className="flex items-center gap-1.5 text-13 text-texto">
        <span className="rotulo">Retorno do técnico</span>
        {ordem.retornoTecnico === 'confirmada' ? (
          <>
            <Check aria-hidden="true" className="size-4" strokeWidth={2} /> confirmada: a falha
            existia
          </>
        ) : ordem.retornoTecnico === 'rejeitada' ? (
          <>
            <X aria-hidden="true" className="size-4" strokeWidth={2} /> rejeitada: não havia falha
          </>
        ) : (
          <span className="text-apoio">ainda sem retorno</span>
        )}
      </span>
    </li>
  )
}
