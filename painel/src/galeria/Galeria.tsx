import { useState, type ReactNode } from 'react'

import { ErroApi } from '@/api/erros'
import { EsquemaTorno } from '@/componentes/instrumento/EsquemaTorno'
import {
  EstadoAcordando,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/componentes/instrumento/Estados'
import { GraficoTendencia } from '@/componentes/instrumento/GraficoTendencia'
import { MarcaDeIdade } from '@/componentes/instrumento/Idade'
import { Leitura } from '@/componentes/instrumento/Leitura'
import { MapaOrdens } from '@/componentes/instrumento/MapaOrdens'
import { MarcadorPonto } from '@/componentes/instrumento/MarcadorPonto'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'
import { ReguaDesvio } from '@/componentes/instrumento/ReguaDesvio'
import { Reticula } from '@/componentes/instrumento/Reticula'
import { SegurarParaConfirmar } from '@/componentes/instrumento/SegurarParaConfirmar'
import { PlacaEstado, SeloAvaliacao } from '@/componentes/instrumento/Selos'
import { FaixaSimulado, SeloSim } from '@/componentes/instrumento/SeloSim'
import { Sparkline } from '@/componentes/instrumento/Sparkline'
import { Tacometro } from '@/componentes/instrumento/Tacometro'
import { Button } from '@/componentes/ui/button'
import { Input } from '@/componentes/ui/input'
import { Label } from '@/componentes/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/componentes/ui/toggle-group'
import { TooltipProvider } from '@/componentes/ui/tooltip'
import { formatarG, formatarNumero } from '@/dominio/formato'
import { definirTema, useTema } from '@/estado/preferencias'

import {
  INTERVALOS_MAPA,
  LINHAS_MAPA_COM_REFERENCIA,
  LINHAS_MAPA_SEM_REFERENCIA,
  MARCA_DA_GALERIA,
  NOME_MUITO_LONGO,
  NOMINAIS_EXEMPLO,
  NUMERO_ENORME,
  PICO_TENDENCIA,
  RASTRO_ALARME,
  RASTRO_NORMAL,
  REFERENCIA_EXEMPLO,
  RMS_TENDENCIA,
  SPARK_COM_LACUNA,
  SPARK_NORMAL,
  TEMPOS_TENDENCIA,
} from './dados'

function Caso({
  titulo,
  children,
  largo = false,
}: {
  titulo: string
  children: ReactNode
  largo?: boolean
}) {
  return (
    <div
      className={
        largo
          ? 'flex min-w-0 flex-col items-start gap-1.5 bg-modulo p-3 md:col-span-2'
          : 'flex min-w-0 flex-col items-start gap-1.5 bg-modulo p-3'
      }
    >
      <span className="text-12 text-fraco">{titulo}</span>
      {children}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={titulo}>
      <h2 className="text-15 font-semibold">{titulo}</h2>
      <div className="grid gap-px border border-linha bg-linha md:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
  )
}

/**
 * Galeria de componentes: só para desenvolvimento e teste. Cada componente de instrumento em cada
 * estado (normal, atenção, alarme, velho, simulado, vazio, erro, texto muito longo, número enorme),
 * nos dois temas. Os dados são de exemplo (./dados.ts) e não vêm da API.
 */
export function Galeria() {
  const tema = useTema()
  const [confirmacoes, setConfirmacoes] = useState(0)

  return (
    <TooltipProvider>
      <main className="flex flex-col gap-6 px-4 py-3" data-galeria={MARCA_DA_GALERIA}>
        <header className="flex flex-wrap items-center gap-3 border-b border-linha-forte pb-2">
          <h1 className="text-18 font-semibold">Galeria de componentes</h1>
          <span className="text-13 text-apoio">
            só desenvolvimento · dados de exemplo, nenhum vem da API
          </span>
          <ToggleGroup
            className="ml-auto"
            aria-label="Tema"
            value={[tema]}
            onValueChange={(v) => {
              if (v[0] === 'claro' || v[0] === 'grafite') definirTema(v[0])
            }}
          >
            <ToggleGroupItem value="claro" size="sm">
              Claro
            </ToggleGroupItem>
            <ToggleGroupItem value="grafite" size="sm">
              Grafite
            </ToggleGroupItem>
          </ToggleGroup>
        </header>

        <section className="flex flex-col gap-2" aria-label="Sinal e estado nos dois temas">
          <h2 className="text-15 font-semibold">
            Sinal (ciano) e estado (âmbar, vermelho) nos dois temas
          </h2>
          <p className="text-13 text-apoio">
            O ciano é função (ao vivo, foco, cursor, chegada de janela); âmbar e vermelho são
            estado. Os dois aparecem juntos aqui para provar que não se confundem.
          </p>
          <div className="grid gap-px border border-linha bg-linha md:grid-cols-2">
            {(['grafite', 'claro'] as const).map((t) => (
              <div key={t} data-theme={t} className="flex flex-col gap-3 bg-fundo p-3 text-texto">
                <span className="rotulo">tema {t}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5 border border-sinal px-2 py-1 text-12 font-medium text-sinal">
                    AO VIVO 1 s · termina em 1:42
                  </span>
                  <SeloAvaliacao avaliacao="atencao" />
                  <SeloAvaliacao avaliacao="alarme" />
                  <SeloAvaliacao avaliacao="sem_referencia" />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <MarcadorPonto codigo="A" avaliacao="atencao" />
                  <MarcadorPonto codigo="B" avaliacao="alarme" />
                  <span className="rounded-full outline-2 outline-offset-2 outline-sinal">
                    <MarcadorPonto codigo="C" />
                  </span>
                  <Sparkline valores={SPARK_NORMAL} descricao={`sparkline no tema ${t}`} />
                  <Button>Foco</Button>
                </div>
                <ReguaDesvio valor={0.09} referencia={REFERENCIA_EXEMPLO} rastro={RASTRO_NORMAL} />
                <ReguaDesvio valor={0.12} referencia={REFERENCIA_EXEMPLO} rastro={RASTRO_ALARME} />
                <div className="h-0.5 bg-sinal" />
              </div>
            ))}
          </div>
        </section>

        <Secao titulo="Tacômetro">
          <Caso titulo="1180 rpm: marcha mais próxima 1120" largo>
            <Tacometro className="self-stretch" rpm={1180} nominais={NOMINAIS_EXEMPLO} />
          </Caso>
          <Caso titulo="velho">
            <Tacometro className="self-stretch" rpm={560} nominais={NOMINAIS_EXEMPLO} velho />
          </Caso>
          <Caso titulo="parado · sem rotação">
            <Tacometro className="self-stretch" rpm={0} nominais={NOMINAIS_EXEMPLO} />
            <Tacometro className="self-stretch" rpm={null} nominais={NOMINAIS_EXEMPLO} />
          </Caso>
        </Secao>

        <Secao titulo="Leitura">
          <Caso titulo="normal (destaque, 40 px)">
            <Leitura rotulo="RMS" valor={formatarG(0.048)} unidade="g" tamanho="destaque" />
            <Leitura rotulo="Curt" titulo="curtose" valor="2,47" tamanho="grande" />
          </Caso>
          <Caso titulo="velho">
            <Leitura rotulo="RMS" valor={formatarG(0.048)} unidade="g" tamanho="grande" velho />
            <MarcaDeIdade frescor="velho" idadeS={137} />
          </Caso>
          <Caso titulo="vazio (sem dado)">
            <Leitura rotulo="PICO" valor={formatarG(null)} unidade="g" tamanho="grande" />
            <MarcaDeIdade frescor="ausente" idadeS={null} />
          </Caso>
          <Caso titulo="número enorme">
            <Leitura
              rotulo="RPM"
              valor={formatarNumero(NUMERO_ENORME, 0)}
              unidade="rpm"
              tamanho="grande"
            />
          </Caso>
        </Secao>

        <Secao titulo="Placa de estado e avaliação">
          <Caso titulo="operando · sem referência">
            <PlacaEstado estado="operando" />
            <SeloAvaliacao avaliacao="sem_referencia" />
          </Caso>
          <Caso titulo="parado · normal">
            <PlacaEstado estado="parado" />
            <SeloAvaliacao avaliacao="normal" />
          </Caso>
          <Caso titulo="sem dados · atenção">
            <PlacaEstado estado="sem_dados" />
            <SeloAvaliacao avaliacao="atencao" />
          </Caso>
          <Caso titulo="operando · alarme">
            <PlacaEstado estado="operando" />
            <SeloAvaliacao avaliacao="alarme" />
          </Caso>
        </Secao>

        <Secao titulo="Marcador de ponto (forma muda com o estado)">
          <Caso titulo="sem referência · normal · atenção · alarme">
            <div className="flex items-center gap-3">
              <MarcadorPonto codigo="A" />
              <MarcadorPonto codigo="B" avaliacao="normal" />
              <MarcadorPonto codigo="C" avaliacao="atencao" />
              <MarcadorPonto codigo="A" avaliacao="alarme" />
              <MarcadorPonto codigo="R" tamanho="pequeno" />
            </div>
          </Caso>
          <Caso titulo="selo SIM e hachura">
            <div className="hachura flex h-10 items-center gap-2 self-stretch border border-linha px-2">
              <SeloSim />
            </div>
          </Caso>
          <Caso titulo="faixa de dados simulados" largo>
            <FaixaSimulado className="self-stretch" />
          </Caso>
        </Secao>

        <Secao titulo="Régua de desvio">
          <Caso titulo="sem referência (hoje)">
            <ReguaDesvio valor={0.05} referencia={null} className="self-stretch" />
          </Caso>
          <Caso titulo="normal, com rastro">
            <ReguaDesvio
              className="self-stretch"
              valor={0.053}
              referencia={REFERENCIA_EXEMPLO}
              rastro={RASTRO_NORMAL}
            />
          </Caso>
          <Caso titulo="atenção">
            <ReguaDesvio
              className="self-stretch"
              valor={0.09}
              referencia={REFERENCIA_EXEMPLO}
              rastro={RASTRO_NORMAL}
            />
          </Caso>
          <Caso titulo="alarme · velho">
            <ReguaDesvio
              className="self-stretch"
              valor={0.12}
              referencia={REFERENCIA_EXEMPLO}
              rastro={RASTRO_ALARME}
            />
            <ReguaDesvio
              className="self-stretch"
              valor={0.12}
              referencia={REFERENCIA_EXEMPLO}
              velho
            />
          </Caso>
        </Secao>

        <Secao titulo="Sparkline">
          <Caso titulo="normal (contínua, último trecho em sinal)">
            <Sparkline valores={SPARK_NORMAL} descricao="exemplo" />
          </Caso>
          <Caso titulo="com lacuna">
            <Sparkline valores={SPARK_COM_LACUNA} descricao="exemplo com lacuna" />
          </Caso>
          <Caso titulo="velho">
            <Sparkline valores={SPARK_NORMAL} velho descricao="exemplo velho" />
          </Caso>
          <Caso titulo="vazio (menos de 2 valores)">
            <Sparkline valores={[0.05]} descricao="exemplo vazio" />
          </Caso>
        </Secao>

        <Secao titulo="Botões e controles">
          <Caso titulo="ação principal · comum · desabilitado">
            <div className="flex flex-wrap gap-2">
              <Button variant="default">Entrar</Button>
              <Button>Exportar CSV</Button>
              <Button disabled>Desabilitado</Button>
            </div>
          </Caso>
          <Caso titulo="segurar para confirmar (1,5 s)">
            <SegurarParaConfirmar aoConfirmar={() => setConfirmacoes((c) => c + 1)}>
              Descartar ensaio
            </SegurarParaConfirmar>
            <span className="valor text-12 text-apoio">confirmações: {confirmacoes}</span>
          </Caso>
          <Caso titulo="campo · inválido">
            <Label htmlFor="g-campo">E-mail</Label>
            <Input id="g-campo" defaultValue="operador@" aria-invalid className="self-stretch" />
          </Caso>
          <Caso titulo="texto muito longo">
            <Modulo rotulo={NOME_MUITO_LONGO} detalhe={NOME_MUITO_LONGO} className="self-stretch">
              <Leitura rotulo="Código" valor={NOME_MUITO_LONGO} />
            </Modulo>
          </Caso>
        </Secao>

        <Secao titulo="Estados">
          <Caso titulo="vazio">
            <EstadoVazio titulo="Nenhuma medição real recebida.">
              O dispositivo ainda não enviou janelas.
            </EstadoVazio>
          </Caso>
          <Caso titulo="carregando">
            <EstadoCarregando />
          </Caso>
          <Caso titulo="erro da API (com campos)">
            <EstadoErro
              erro={
                new ErroApi(400, {
                  mensagem: 'Dados inválidos',
                  campos: [{ campo: 'rotacoes_rpm', mensagem: 'não deve ser nulo' }],
                })
              }
            />
          </Caso>
          <Caso titulo="API acordando">
            <EstadoAcordando />
          </Caso>
        </Secao>

        <Secao titulo="Módulos">
          <Caso titulo="módulo comum" largo>
            <Painel className="self-stretch">
              <Modulo rotulo="Ponto A" detalhe="acionamento · Cabeçote">
                <Leitura rotulo="RMS" valor={formatarG(0.048)} unidade="g" />
              </Modulo>
            </Painel>
          </Caso>
          <Caso titulo="módulo simulado" largo>
            <Painel className="self-stretch">
              <Modulo rotulo="Ponto A" detalhe="acionamento · Cabeçote" simulado>
                <Leitura rotulo="RMS" valor={formatarG(0.048)} unidade="g" />
              </Modulo>
            </Painel>
          </Caso>
        </Secao>

        <section className="flex flex-col gap-2" aria-label="Mapa de ordens">
          <h2 className="text-15 font-semibold">Mapa de ordens</h2>
          <Painel>
            <Modulo rotulo="Sem referência (hoje) · com lacuna e saturação">
              <MapaOrdens intervalos={INTERVALOS_MAPA} linhas={LINHAS_MAPA_SEM_REFERENCIA} />
            </Modulo>
            <Modulo rotulo="Com referência (futuro): atenção em âmbar, alarme em vermelho">
              <MapaOrdens intervalos={INTERVALOS_MAPA} linhas={LINHAS_MAPA_COM_REFERENCIA} />
            </Modulo>
            <Modulo rotulo="Fonte simulada" simulado>
              <MapaOrdens
                intervalos={INTERVALOS_MAPA}
                linhas={LINHAS_MAPA_SEM_REFERENCIA}
                simulado
              />
            </Modulo>
          </Painel>
        </section>

        <section className="flex flex-col gap-2" aria-label="Gráfico de tendência e retícula">
          <h2 className="text-15 font-semibold">Gráfico de tendência e retícula</h2>
          <Painel className="md:grid-cols-[3fr_1fr]">
            <Modulo rotulo="Tendência com lacuna, saturação, ensaio e referência" semRecuo>
              <GraficoTendencia
                temposS={TEMPOS_TENDENCIA}
                series={[
                  { rotulo: 'RMS', valores: RMS_TENDENCIA, tom: 0, espessura: 1.75 },
                  { rotulo: 'PICO', valores: PICO_TENDENCIA, tom: 2, espessura: 1 },
                ]}
                altura={240}
                unidade="g"
                casas={3}
                faixas={[
                  {
                    inicioS: TEMPOS_TENDENCIA[70] ?? 0,
                    fimS: TEMPOS_TENDENCIA[110] ?? 0,
                    rotulo: 'TORNO-01-T3-00012',
                  },
                ]}
                saturadas={[TEMPOS_TENDENCIA[90] ?? 0]}
                referencia={REFERENCIA_EXEMPLO}
                descricao="exemplo de tendência"
              />
            </Modulo>
            <Modulo rotulo="Retícula 10 × 8">
              <div className="relative h-40 border border-linha-forte bg-rebaixo">
                <Reticula />
              </div>
            </Modulo>
          </Painel>
        </section>

        <section className="flex flex-col gap-2" aria-label="Esquema do torno">
          <h2 className="text-15 font-semibold">Esquema do torno</h2>
          <Painel>
            <Modulo rotulo="Marcadores em estados diferentes">
              <EsquemaTorno
                marcadores={[
                  {
                    codigo: 'A',
                    lugar: 'A',
                    papel: 'acionamento',
                    conteudo: <MarcadorPonto codigo="A" avaliacao="alarme" />,
                  },
                  {
                    codigo: 'B',
                    lugar: 'B',
                    papel: 'ferramenta–peça',
                    conteudo: <MarcadorPonto codigo="B" avaliacao="atencao" />,
                  },
                  {
                    codigo: 'C',
                    lugar: 'C',
                    papel: 'estrutura',
                    conteudo: <MarcadorPonto codigo="C" />,
                  },
                  {
                    codigo: 'R',
                    lugar: 'R',
                    papel: 'rotação',
                    conteudo: <MarcadorPonto codigo="R" tamanho="pequeno" />,
                  },
                ]}
                className="max-w-3xl"
              />
            </Modulo>
          </Painel>
        </section>
      </main>
    </TooltipProvider>
  )
}
