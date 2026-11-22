import { useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { Alarme, EstadoAlarme, OrdemServico, RetornoTecnico } from '@/api/adaptadores/alarmes'
import { consultaLimites } from '@/api/adaptadores/referencia'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { Button } from '@/componentes/ui/button'
import { Explica } from '@/componentes/ui/explica'
import { formatarDataHora, formatarMinutos, formatarNumero } from '@/dominio/formato'
import {
  CONDICOES_ENCONTRADAS,
  nomeDaClasse,
  ROTULO_MEDIDA,
  type CondicaoEncontrada,
} from '@/dominio/modelos'
import { cn } from '@/lib/utils'

const ROTULO_ESTADO: Record<EstadoAlarme, string> = {
  ativo_nao_reconhecido: 'ativo, não reconhecido',
  ativo_reconhecido: 'ativo, reconhecido',
  normalizado_nao_reconhecido: 'voltou ao normal sem reconhecimento',
  encerrado: 'encerrado',
  suprimido: 'suprimido',
}

/**
 * Ícone do alarme: losango (alarme) ou triângulo (atenção), preenchido na cor do nível. Ativo não
 * reconhecido: só o ícone pisca devagar; com movimento reduzido, um anel parado em volta ocupa o lugar
 * do piscar. Normalizado sem reconhecimento: vazado. Encerrado: vazado e cinza. Suprimido: cinza riscado.
 */
export function IconeDoAlarme({ alarme }: { alarme: Alarme }) {
  const { estado, nivel } = alarme
  // cor só no que está em desvio: voltou ao normal, encerrado ou suprimido ficam em cinza
  const apagado =
    estado === 'suprimido' || estado === 'encerrado' || estado === 'normalizado_nao_reconhecido'
  const cor = apagado
    ? 'var(--texto-fraco)'
    : nivel === 'alarme'
      ? 'var(--estado-alarme)'
      : 'var(--estado-atencao)'
  const vazado = estado === 'normalizado_nao_reconhecido' || estado === 'encerrado'
  const forma = nivel === 'alarme' ? 'M8 1 15 8 8 15 1 8Z' : 'M8 1.5 15 14.5H1Z'
  const pisca = estado === 'ativo_nao_reconhecido'
  return (
    <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
      {pisca ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 hidden rounded-full border-2 motion-reduce:block"
          style={{ borderColor: cor }}
        />
      ) : null}
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={cn('size-4', pisca && 'motion-safe:animate-[piscar-lento_2s_linear_infinite]')}
      >
        <path d={forma} fill={vazado ? 'none' : cor} stroke={cor} strokeWidth={vazado ? 2 : 1} />
        {estado === 'suprimido' ? (
          <path d="M2 14 14 2" stroke="var(--texto)" strokeWidth={1.5} />
        ) : null}
      </svg>
    </span>
  )
}

/**
 * Supressão inline (sem modal): motivo e prazo obrigatórios. Os prazos vêm da API
 * (ps.alarme.supressao-opcoes-min na rota de limites); enquanto ela não responde, o seletor fica vazio
 * e o botão desabilitado.
 */
function FormularioDeSupressao({
  aoSuprimir,
  aoCancelar,
}: {
  aoSuprimir: (motivo: string, minutos: number) => void
  aoCancelar: () => void
}) {
  const limites = useQuery(consultaLimites())
  const prazos = limites.data?.alarme.supressao_opcoes_min ?? []
  const [motivo, setMotivo] = useState('')
  const [escolhido, setMinutos] = useState<number | null>(null)
  // padrão: 1 h se estiver entre as opções, senão a primeira
  const minutos = escolhido ?? (prazos.includes(60) ? 60 : (prazos[0] ?? null))
  return (
    <form
      className="col-span-2 flex flex-wrap items-end gap-2 border border-linha-forte bg-rebaixo p-2 sm:col-span-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (motivo.trim() && minutos !== null) aoSuprimir(motivo.trim(), minutos)
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-13">
        <span className="rotulo">Motivo</span>
        <input
          required
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="h-8 border border-linha-forte bg-modulo px-2 text-13 text-texto"
          placeholder="por que silenciar"
        />
      </label>
      <label className="flex flex-col gap-1 text-13">
        <span className="rotulo">Prazo</span>
        <select
          value={minutos ?? ''}
          onChange={(e) => setMinutos(Number(e.target.value))}
          className="h-8 border border-linha-forte bg-modulo px-2 text-13 text-texto"
        >
          {prazos.map((p) => (
            <option key={p} value={p}>
              {formatarMinutos(p)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={!motivo.trim() || minutos === null}>
        Suprimir
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={aoCancelar}>
        Cancelar
      </Button>
    </form>
  )
}

export type AcoesDoAlarme = {
  aoReconhecer?: (id: number) => void
  /** Só ADMIN. */
  aoSuprimir?: (id: number, motivo: string, minutos: number) => void
  aoCancelarSupressao?: (id: number) => void
}

/**
 * Linha de alarme (ISA-18.2): nível e estado em forma, cor e texto; ação recomendada em destaque,
 * explicação, ponto e componente; "durante ensaio de {condição}" quando nasceu numa gravação de falha.
 */
export function LinhaAlarme({
  alarme,
  aoReconhecer,
  aoSuprimir,
  aoCancelarSupressao,
}: { alarme: Alarme } & AcoesDoAlarme) {
  const [suprimindo, setSuprimindo] = useState(false)
  const instrumento = alarme.tipo === 'instrumento'
  const nivel = instrumento ? 'INSTRUMENTO' : alarme.nivel === 'alarme' ? 'ALARME' : 'ATENÇÃO'
  const apagado =
    alarme.estado === 'suprimido' ||
    alarme.estado === 'encerrado' ||
    alarme.estado === 'normalizado_nao_reconhecido'
  const reconhecivel =
    alarme.estado === 'ativo_nao_reconhecido' || alarme.estado === 'normalizado_nao_reconhecido'
  const ativo = alarme.estado === 'ativo_nao_reconhecido' || alarme.estado === 'ativo_reconhecido'
  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-linha px-3 py-2 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      data-estado={alarme.estado}
      data-nivel={alarme.nivel}
      data-testid="linha-alarme"
    >
      <IconeDoAlarme alarme={alarme} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 text-15 text-texto">
          <span
            className={cn(
              'text-12 font-semibold tracking-[0.08em]',
              apagado
                ? 'text-apoio'
                : alarme.nivel === 'alarme' && !instrumento
                  ? 'text-alarme-texto'
                  : 'text-atencao-texto',
            )}
          >
            {nivel}
          </span>
          <Link
            to="/alarmes/$alertaId"
            params={{ alertaId: String(alarme.id) }}
            className="valor font-semibold underline underline-offset-4"
            aria-label={`Detalhe do alerta ${alarme.id}`}
          >
            {alarme.maquina}
          </Link>
          <span>
            ponto <span className="valor font-semibold">{alarme.ponto}</span>
            {instrumento ? null : (
              <>
                {' '}
                · {ROTULO_MEDIDA[alarme.metrica] ?? alarme.metrica}{' '}
                {alarme.z !== null ? (
                  <span className="valor">z {formatarNumero(alarme.z, 1)}</span>
                ) : null}
              </>
            )}
          </span>
          <span className="text-12 text-apoio">prioridade {alarme.prioridade}</span>
        </span>
        <span className="text-13 text-apoio">
          {ROTULO_ESTADO[alarme.estado]} · desde{' '}
          <span className="valor">{formatarDataHora(alarme.criado_em)}</span>
          {alarme.componente ? <> · {alarme.componente}</> : null}
          {alarme.durante_ensaio_de_condicao ? (
            <span className="ml-1 border border-dashed border-linha-forte px-1 text-12 text-texto">
              durante ensaio de {alarme.condicao_ensaio?.replaceAll('_', ' ')}
            </span>
          ) : null}
        </span>
        {alarme.estado === 'suprimido' && alarme.suprimido_ate ? (
          <span className="text-13 text-apoio">
            suprimido até <span className="valor">{formatarDataHora(alarme.suprimido_ate)}</span>
            {alarme.motivo_supressao ? <>: {alarme.motivo_supressao}</> : null}
          </span>
        ) : null}
        <p className="mt-1 bg-rebaixo px-2 py-1.5 text-15 text-texto">
          <span className="rotulo mr-1">Ação recomendada</span>
          <Explica chave="acao_recomendada" className="mr-2" />
          {alarme.acao_recomendada}
        </p>
        {alarme.explicacao ? <p className="text-13 text-apoio">{alarme.explicacao}</p> : null}
      </div>
      <div className="col-span-2 flex flex-wrap items-start gap-2 sm:col-span-1">
        {reconhecivel && aoReconhecer ? (
          <SegurarParaConfirmar aoConfirmar={() => aoReconhecer(alarme.id)}>
            Segure para reconhecer
          </SegurarParaConfirmar>
        ) : null}
        {ativo && aoSuprimir && !suprimindo ? (
          <Button size="sm" variant="outline" onClick={() => setSuprimindo(true)}>
            Suprimir…
          </Button>
        ) : null}
        {alarme.estado === 'suprimido' && aoCancelarSupressao ? (
          <Button size="sm" variant="outline" onClick={() => aoCancelarSupressao(alarme.id)}>
            Cancelar supressão
          </Button>
        ) : null}
      </div>
      {suprimindo && aoSuprimir ? (
        <FormularioDeSupressao
          aoSuprimir={(motivo, minutos) => {
            aoSuprimir(alarme.id, motivo, minutos)
            setSuprimindo(false)
          }}
          aoCancelar={() => setSuprimindo(false)}
        />
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

const ROTULO_MOTIVO: Record<string, string> = {
  alarme_continuo: 'alarme contínuo',
  severidade: 'severidade acumulada',
}

/**
 * Conclusão: retorno obrigatório (confirmada ou rejeitada), comentário e condição encontrada opcionais. A condição
 * vira rótulo do próximo treino (confirmada com uma das 5 classes; rejeitada entra como normal).
 */
export function FormularioDeConclusao({
  aoConcluir,
}: {
  aoConcluir: (retorno: RetornoTecnico, comentario: string, condicao?: CondicaoEncontrada) => void
}) {
  const [retorno, setRetorno] = useState<RetornoTecnico | null>(null)
  const [comentario, setComentario] = useState('')
  const [condicao, setCondicao] = useState<CondicaoEncontrada | ''>('')
  return (
    <form
      className="flex flex-col gap-2 border border-linha-forte bg-rebaixo p-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (retorno) aoConcluir(retorno, comentario, condicao || undefined)
      }}
    >
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-13 text-texto">
        <legend className="rotulo mb-1">Retorno do técnico</legend>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="retorno"
            checked={retorno === 'confirmada'}
            onChange={() => setRetorno('confirmada')}
          />
          confirmada: havia problema
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="retorno"
            checked={retorno === 'rejeitada'}
            onChange={() => setRetorno('rejeitada')}
          />
          rejeitada: falso positivo
        </label>
      </fieldset>
      <label className="flex flex-col gap-1 text-13">
        <span className="rotulo">Comentário</span>
        <textarea
          value={comentario}
          maxLength={2000}
          rows={2}
          onChange={(e) => setComentario(e.target.value)}
          className="border border-linha-forte bg-modulo px-2 py-1 text-13 text-texto"
          placeholder="o que foi encontrado"
        />
      </label>
      <label className="flex flex-col gap-1 text-13">
        <span className="rotulo">Condição encontrada (opcional)</span>
        <select
          value={condicao}
          onChange={(e) => setCondicao(e.target.value as CondicaoEncontrada | '')}
          className="h-8 border border-linha-forte bg-modulo px-2 text-13 text-texto"
        >
          <option value="">não informar</option>
          {CONDICOES_ENCONTRADAS.map((c) => (
            <option key={c} value={c}>
              {nomeDaClasse(c)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" className="self-start" disabled={!retorno}>
        Concluir OS
      </Button>
    </form>
  )
}

/** Linha de ordem de serviço: ação recomendada em destaque, explicação e o retorno do técnico. */
export function LinhaOrdemServico({
  ordem,
  aoAssumir,
  aoConcluir,
}: {
  ordem: OrdemServico
  /** Só ADMIN e TECNICO. */
  aoAssumir?: (id: number) => void
  aoConcluir?: (
    id: number,
    retorno: RetornoTecnico,
    comentario: string,
    condicao?: CondicaoEncontrada,
  ) => void
}) {
  const emAberto = ordem.status === 'aberta' || ordem.status === 'em_andamento'
  const [concluindo, setConcluindo] = useState(false)
  return (
    <li
      className="flex flex-col gap-1.5 border-b border-linha px-3 py-2 last:border-b-0"
      data-status={ordem.status}
      data-testid="linha-os"
    >
      <span className="flex flex-wrap items-baseline gap-x-3 text-13 text-apoio">
        <Link
          to="/ordens/$osId"
          params={{ osId: String(ordem.id) }}
          className="valor text-15 font-semibold text-texto underline underline-offset-4"
        >
          {ordem.numero}
        </Link>
        <span className="valor">{ordem.maquina}</span>
        <span>
          ponto <span className="valor text-texto">{ordem.ponto}</span>
          {ordem.componente ? <> · {ordem.componente}</> : null}
        </span>
        <span className="border border-linha-forte px-1 text-12 tracking-[0.06em] text-texto uppercase">
          {ROTULO_STATUS[ordem.status]}
        </span>
        <span>
          aberta em <span className="valor">{formatarDataHora(ordem.aberta_em)}</span> por{' '}
          {ROTULO_MOTIVO[ordem.motivo_abertura] ?? ordem.motivo_abertura}
        </span>
        <span className="flex items-center gap-1">
          severidade <span className="valor">{formatarNumero(ordem.severidade_acumulada, 0)}</span>{' '}
          z·s
          <Explica chave="severidade" />
        </span>
      </span>
      <p className="border-t border-linha-forte py-1.5 text-15 font-semibold text-texto">
        <span className="mb-0.5 flex items-center gap-1">
          <span className="rotulo">Ação recomendada</span>
          <Explica chave="acao_recomendada" />
        </span>
        {ordem.acao_recomendada}
      </p>
      {ordem.explicacao ? <p className="text-13 text-apoio">{ordem.explicacao}</p> : null}
      {ordem.responsavel ? (
        <span className="text-13 text-apoio">responsável: {ordem.responsavel}</span>
      ) : null}
      <span className="flex flex-wrap items-center gap-1.5 text-13 text-texto">
        <span className="rotulo">Retorno do técnico</span>
        {ordem.retorno_tecnico === 'confirmada' ? (
          <>
            <Check aria-hidden="true" className="size-4" strokeWidth={2} /> confirmada: havia
            problema
          </>
        ) : ordem.retorno_tecnico === 'rejeitada' ? (
          <>
            <X aria-hidden="true" className="size-4" strokeWidth={2} /> rejeitada: falso positivo
          </>
        ) : (
          <span className="text-apoio">ainda sem retorno</span>
        )}
        {ordem.comentario_tecnico ? (
          <span className="text-apoio">· {ordem.comentario_tecnico}</span>
        ) : null}
        {ordem.condicao_encontrada ? (
          <span className="text-apoio">
            · encontrado: {nomeDaClasse(ordem.condicao_encontrada)}
          </span>
        ) : null}
      </span>
      {emAberto && (aoAssumir || aoConcluir) && !concluindo ? (
        <span className="flex flex-wrap gap-2">
          {ordem.status === 'aberta' && aoAssumir ? (
            <Button size="sm" variant="outline" onClick={() => aoAssumir(ordem.id)}>
              Assumir OS
            </Button>
          ) : null}
          {aoConcluir ? (
            <Button size="sm" variant="outline" onClick={() => setConcluindo(true)}>
              Concluir OS…
            </Button>
          ) : null}
        </span>
      ) : null}
      {emAberto && aoConcluir && concluindo ? (
        <FormularioDeConclusao
          aoConcluir={(retorno, comentario, condicao) =>
            aoConcluir(ordem.id, retorno, comentario, condicao)
          }
        />
      ) : null}
    </li>
  )
}
