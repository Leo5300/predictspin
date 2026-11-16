import { Link } from '@tanstack/react-router'
import { LogOut, Moon, Sun } from 'lucide-react'

import { sair } from '@/api/autenticacao'
import { useSaude } from '@/api/saude'
import type { Usuario } from '@/api/tipos'
import { FormaDeEstado } from '@/componentes/instrumento/FormaDeEstado'
import type { Forma } from '@/componentes/instrumento/formasDeEstado'
import { MarcaDeIdade } from '@/componentes/instrumento/Idade'
import { Button } from '@/componentes/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/componentes/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { estadoDaConexao, type EstadoConexao } from '@/dominio/conexao'
import { formatarHora } from '@/dominio/formato'
import { podeAbrir, ROTULO_PAPEL_USUARIO } from '@/dominio/papeis'
import { definirFonte, definirTema, useFonte, useTema, type Fonte } from '@/estado/preferencias'
import { useSegundo } from '@/estado/relogio'
import {
  useAoVivo,
  useLimiarVelhoS,
  useTransporte,
  useUltimaObservacao,
  type Transporte,
} from '@/estado/transporte'
import { useFrescor } from '@/hooks/useFrescor'
import { cn } from '@/lib/utils'

const ROTULO_CONEXAO: Record<EstadoConexao, string> = {
  ok: 'API ok',
  acordando: 'API acordando',
  sem_conexao: 'Sem conexão',
}

const FORMA_CONEXAO: Record<EstadoConexao, Forma> = {
  ok: 'circulo',
  acordando: 'anel',
  sem_conexao: 'losango',
}

const ROTULO_TRANSPORTE: Record<Transporte, string | null> = {
  eventos: 'eventos ao vivo',
  consulta: 'consulta a cada 5 s',
  inativo: null,
  replay: null,
}

/**
 * Barra superior fixa: marca (só tipográfica), navegação, relógio, estado da conexão, idade da
 * última janela, fonte dos dados, tema e usuário.
 */
export function BarraSuperior({ usuario }: { usuario: Usuario }) {
  return (
    <header className="z-40 border-b border-linha-forte bg-modulo">
      {/* desktop: uma linha. Celular: grade com lugares fixos (marca, navegação e sair; conexão e
          última janela; fonte e tema), para nada pular de linha quando o texto muda */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:flex sm:flex-wrap sm:gap-x-4">
        <Link
          to="/"
          className="col-start-1 row-start-1 text-15 font-semibold tracking-tight text-texto"
          translate="no"
          aria-label="PredictSpin: visão geral"
        >
          PredictSpin
        </Link>

        <nav aria-label="Principal" className="col-start-2 row-start-1 flex items-center gap-1">
          <LinkDeNavegacao para="/">Visão geral</LinkDeNavegacao>
          {podeAbrir(usuario.papel, 'coleta') ? (
            <LinkDeNavegacao para="/coleta">Coleta</LinkDeNavegacao>
          ) : null}
        </nav>

        <div className="col-span-3 row-start-2 flex items-center gap-x-4 sm:ml-auto">
          <Conexao />
          <UltimaJanela />
          <Relogio />
        </div>
        <SeletorDeFonte className="col-span-2 col-start-1 row-start-3 justify-self-start" />
        <SeletorDeTema className="col-start-3 row-start-3 justify-self-end" />
        <div className="col-start-3 row-start-1 flex items-center gap-2 justify-self-end">
          {/* no celular o nome sai da barra (fica na dica do botão de sair) */}
          <span className="flex min-w-0 flex-col leading-tight max-sm:hidden">
            <span className="max-w-40 truncate text-13 font-medium text-texto" title={usuario.nome}>
              {usuario.nome}
            </span>
            {/* o papel só aparece quando diz algo que o nome ainda não disse */}
            {mesmoTexto(usuario.nome, ROTULO_PAPEL_USUARIO[usuario.papel]) ? null : (
              <span className="rotulo">{ROTULO_PAPEL_USUARIO[usuario.papel]}</span>
            )}
          </span>
          <Button
            variant="outline"
            onClick={sair}
            aria-label="Sair do painel"
            title={`${usuario.nome} · sair do painel`}
          >
            <LogOut aria-hidden="true" strokeWidth={1.5} />
            <span className="max-sm:sr-only">Sair</span>
          </Button>
        </div>
      </div>
      <FaixaAoVivo />
    </header>
  )
}

function mesmoTexto(a: string, b: string): boolean {
  const normal = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  return normal(a) === normal(b)
}

function LinkDeNavegacao({ para, children }: { para: '/' | '/coleta'; children: string }) {
  return (
    <Link
      to={para}
      activeOptions={{ exact: para === '/' }}
      className={cn(
        'flex min-h-8 items-center border-b-2 border-transparent px-2 text-13 font-medium text-apoio',
        'pointer-coarse:min-h-11 max-md:min-h-11',
        '[@media(hover:hover)_and_(pointer:fine)]:hover:text-texto',
        'aria-[current=page]:border-texto aria-[current=page]:text-texto',
      )}
    >
      {children}
    </Link>
  )
}

function Relogio() {
  const { epocaMs } = useSegundo()
  return (
    // no celular o relógio do aparelho já está à vista
    <time
      className="valor text-13 text-texto max-sm:hidden"
      dateTime={new Date(epocaMs).toISOString()}
      aria-label="Hora local"
    >
      {formatarHora(epocaMs)}
    </time>
  )
}

function Conexao() {
  const saude = useSaude()
  const transporte = useTransporte()
  const { epocaMs } = useSegundo()
  const estado = estadoDaConexao(saude, epocaMs)
  const detalhe = estado === 'ok' ? ROTULO_TRANSPORTE[transporte] : null
  return (
    <span
      role="status"
      data-conexao={estado}
      data-transporte={transporte}
      className={cn(
        'flex items-center gap-1.5 text-12 whitespace-nowrap',
        estado === 'ok'
          ? 'text-apoio'
          : 'border border-dashed border-linha-forte px-1 font-medium text-texto',
      )}
    >
      <FormaDeEstado
        forma={FORMA_CONEXAO[estado]}
        className={cn('size-2.5', estado === 'acordando' && 'fill-none stroke-current stroke-[3]')}
      />
      <span className="font-medium text-texto">{ROTULO_CONEXAO[estado]}</span>
      {detalhe ? <span className="max-sm:hidden">· {detalhe}</span> : null}
    </span>
  )
}

function UltimaJanela() {
  const observacao = useUltimaObservacao()
  const transporte = useTransporte()
  const limiarS = useLimiarVelhoS()
  const { frescor, idadeS } = useFrescor(observacao, limiarS)
  if (transporte === 'inativo') return null
  if (transporte === 'replay') {
    // replay: a barra não fala em "última janela"; o que está na tela foi gravado antes
    return (
      <span
        className="trama-replay border border-linha-forte px-1.5 text-12 font-semibold tracking-[0.12em] text-texto"
        data-testid="ultima-janela"
        data-frescor="replay"
      >
        <span className="bg-modulo px-0.5">REPLAY</span>
      </span>
    )
  }
  const restanteS = observacao ? Math.max(0, limiarS - observacao.idadeNaObservacaoS) : 0
  return (
    <span
      className="flex items-center gap-1.5 text-12 whitespace-nowrap text-apoio"
      data-testid="ultima-janela"
      data-frescor={frescor}
    >
      <span>última janela</span>
      <MarcaDeIdade frescor={frescor} idadeS={idadeS} />
      {/* esvazia até o limite de dado velho; reinicia a cada janela nova */}
      <span
        aria-hidden="true"
        className="relative h-1 w-12 overflow-hidden border border-linha-forte bg-rebaixo"
      >
        {frescor === 'vivo' && observacao ? (
          <span
            key={observacao.observadoEmMs}
            className="absolute inset-0 origin-left bg-sinal motion-safe:animate-[esvaziar_linear_both]"
            style={{ animationDuration: `${restanteS}s` }}
          />
        ) : null}
      </span>
    </span>
  )
}

/** Faixa fina na cor de sinal sob a barra superior, pulsando a cada segundo, enquanto houver AO VIVO. */
function FaixaAoVivo() {
  const aoVivo = useAoVivo()
  if (!aoVivo) return null
  return (
    <div
      aria-hidden="true"
      className="h-0.5 bg-sinal motion-safe:animate-[pulso-ao-vivo_1s_linear_infinite]"
      data-testid="faixa-ao-vivo"
    />
  )
}

function SeletorDeFonte({ className }: { className?: string }) {
  const fonte = useFonte()
  return (
    <ToggleGroup
      className={className}
      aria-label="Fonte dos dados"
      value={[fonte]}
      onValueChange={(valores) => {
        const nova = valores[0]
        if (nova === 'real' || nova === 'simulado') definirFonte(nova satisfies Fonte)
      }}
    >
      <ToggleGroupItem value="real" size="sm">
        Real
      </ToggleGroupItem>
      <ToggleGroupItem value="simulado" size="sm">
        Simulado
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function SeletorDeTema({ className }: { className?: string }) {
  const tema = useTema()
  const proximo = tema === 'claro' ? 'grafite' : 'claro'
  const rotulo = tema === 'claro' ? 'Mudar para o tema grafite' : 'Mudar para o tema claro'
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className={className}
            aria-label={rotulo}
            onClick={() => definirTema(proximo)}
          >
            {tema === 'claro' ? (
              <Moon aria-hidden="true" strokeWidth={1.5} />
            ) : (
              <Sun aria-hidden="true" strokeWidth={1.5} />
            )}
          </Button>
        }
      />
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  )
}
