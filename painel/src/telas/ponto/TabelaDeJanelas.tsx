import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { LINHAS_POR_PAGINA, consultaPaginaDeJanelas } from '@/api/consultas'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Button } from '@/componentes/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/componentes/ui/table'
import {
  formatarCurtose,
  formatarDataHora,
  formatarG,
  formatarNumero,
  formatarPercentual,
  formatarRpm,
  fracao,
  TRACO,
} from '@/dominio/formato'

type Props = {
  maquinaId: number
  simulado: boolean
  codigo: string
  deMs: number
  ateMs: number
  pagina: number
  aoMudarPagina: (pagina: number) => void
}

/** Janelas do período (normais e rápidas), mais recente primeiro, paginadas pela API. */
export function TabelaDeJanelas({
  maquinaId,
  simulado,
  codigo,
  deMs,
  ateMs,
  pagina,
  aoMudarPagina,
}: Props) {
  const consulta = useQuery(consultaPaginaDeJanelas(maquinaId, simulado, deMs, ateMs, pagina))

  if (consulta.isPending) return <EstadoCarregando rotulo="Carregando janelas…" />
  if (consulta.isError)
    return <EstadoErro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  const { conteudo, total_elementos: total, total_paginas: paginas } = consulta.data
  if (total === 0) {
    return (
      <EstadoVazio titulo={`Nenhuma janela ${simulado ? 'simulada' : 'real'} neste período.`} />
    )
  }

  const primeira = pagina * LINHAS_POR_PAGINA + 1
  const ultima = Math.min(total, primeira + conteudo.length - 1)

  return (
    <div className="flex flex-col">
      <Table aria-label={`Janelas do período, ponto ${codigo}`}>
        <TableHeader>
          <TableRow>
            <TableHead>Medida em</TableHead>
            <TableHead className="text-right">RMS g</TableHead>
            <TableHead className="text-right">Pico g</TableHead>
            <TableHead className="text-right">
              <abbr title="curtose" className="no-underline">
                Curt
              </abbr>
            </TableHead>
            <TableHead className="text-right">1X g</TableHead>
            <TableHead className="text-right">2X g</TableHead>
            <TableHead className="text-right">3X g</TableHead>
            <TableHead className="text-right">RPM</TableHead>
            <TableHead className="text-right">Amostras</TableHead>
            <TableHead>Marcas</TableHead>
            <TableHead>Ensaio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conteudo.map((janela) => {
            const medida = janela.pontos[codigo]
            const completude = fracao(janela.amostras, janela.amostras_esperadas)
            const marcas = [
              janela.modo === 'rapido' ? 'rápida' : null,
              janela.saturou ? 'saturou' : null,
              medida ? null : `sem ponto ${codigo}`,
            ].filter(Boolean)
            return (
              <TableRow key={janela.id}>
                <TableCell className="valor">{formatarDataHora(janela.medido_em)}</TableCell>
                <TableCell className="valor text-right font-medium">
                  {formatarG(medida?.rms_g)}
                </TableCell>
                <TableCell className="valor text-right">{formatarG(medida?.pico_g)}</TableCell>
                <TableCell className="valor text-right">
                  {formatarCurtose(medida?.curtose)}
                </TableCell>
                <TableCell className="valor text-right">{formatarG(medida?.o1x)}</TableCell>
                <TableCell className="valor text-right">{formatarG(medida?.o2x)}</TableCell>
                <TableCell className="valor text-right">{formatarG(medida?.o3x)}</TableCell>
                <TableCell className="valor text-right">
                  {formatarRpm(janela.rotacao_rpm)}
                </TableCell>
                <TableCell className="valor text-right">
                  {completude === null ? TRACO : formatarPercentual(completude, 1)}
                </TableCell>
                <TableCell className="text-12">
                  {marcas.length > 0 ? marcas.join(' · ') : TRACO}
                </TableCell>
                <TableCell
                  className="valor max-w-48 truncate text-12"
                  title={janela.ensaio_codigo ?? undefined}
                >
                  {janela.ensaio_codigo ?? TRACO}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha px-3 py-1.5">
        <p className="text-12 text-apoio" aria-live="polite">
          <span className="valor text-texto">
            {formatarNumero(primeira)}–{formatarNumero(ultima)}
          </span>{' '}
          de <span className="valor text-texto">{formatarNumero(total)}</span> janelas · página{' '}
          <span className="valor text-texto">{pagina + 1}</span> de{' '}
          <span className="valor text-texto">{paginas}</span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" disabled={pagina <= 0} onClick={() => aoMudarPagina(pagina - 1)}>
            <ChevronLeft aria-hidden="true" strokeWidth={1.5} />
            Mais recentes
          </Button>
          <Button
            size="sm"
            disabled={pagina + 1 >= paginas}
            onClick={() => aoMudarPagina(pagina + 1)}
          >
            Mais antigas
            <ChevronRight aria-hidden="true" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </div>
  )
}
