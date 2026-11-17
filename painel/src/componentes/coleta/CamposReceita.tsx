import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, Info, Plus, X } from 'lucide-react'
import { useId, useState } from 'react'

import {
  consultaCatalogo,
  criarItemDoCatalogo,
  type ItemCatalogo,
  type TipoCatalogo,
} from '@/api/coleta'
import { mensagemDoErro } from '@/api/erros'
import { Button } from '@/componentes/ui/button'
import { Input } from '@/componentes/ui/input'
import { buscarNoCatalogo, nomeDeExibicao, normalizarNome } from '@/dominio/nomes'
import type { ItemDaReceita } from '@/dominio/receita'
import { cn } from '@/lib/utils'

/** Erro ou aviso sob um campo: ícone, borda e texto, sem cor de estado (não é alarme da máquina). */
export function MensagemDoCampo({
  id,
  erro,
  aviso,
}: {
  id: string
  erro?: string | null
  aviso?: string | null
}) {
  if (erro) {
    return (
      <p id={id} role="alert" className="flex items-start gap-1.5 text-13 font-medium text-texto">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        {erro}
      </p>
    )
  }
  if (aviso) {
    return (
      <p id={id} className="flex items-start gap-1.5 text-13 text-apoio">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        {aviso}
      </p>
    )
  }
  return null
}

type PropsNumero = {
  rotulo: string
  unidade: string
  valor: string
  aoMudar: (valor: string) => void
  erro?: string | null
  aviso?: string | null
  /** Exemplo do formato, no placeholder. */
  exemplo?: string
  nome: string
}

/** Número com a unidade fixa ao lado; aceita vírgula ou ponto; teclado numérico no celular. */
export function CampoNumero({
  rotulo,
  unidade,
  valor,
  aoMudar,
  erro,
  aviso,
  exemplo,
  nome,
}: PropsNumero) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <div className="flex items-stretch">
        <Input
          id={id}
          name={nome}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={valor}
          placeholder={exemplo}
          onChange={(e) => aoMudar(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || aviso ? `${id}-msg` : undefined}
          className="valor min-h-11 rounded-r-0 text-15"
        />
        <span className="flex min-w-16 items-center justify-center rounded-r-2 border border-l-0 border-linha-forte bg-modulo px-2 text-13 text-apoio">
          {unidade}
        </span>
      </div>
      <MensagemDoCampo id={`${id}-msg`} erro={erro} aviso={aviso} />
    </div>
  )
}

type PropsCatalogo = {
  tipo: TipoCatalogo
  rotulo: string
  valor: ItemDaReceita | null
  aoMudar: (item: ItemDaReceita | null) => void
  erro?: string | null
}

/**
 * Escolha no catálogo com busca que ignora maiúsculas, acentos, pontuação e espaços extras. Se o texto
 * não bate com nenhum item, mostra os parecidos ("parecido com Aço SAE 1045 — é esse?") antes de
 * oferecer "criar no catálogo", que pede confirmação. Se o nome já existir (409), a API devolve o item
 * existente e ele é escolhido.
 */
export function CampoCatalogo({ tipo, rotulo, valor, aoMudar, erro }: PropsCatalogo) {
  const id = useId()
  const cliente = useQueryClient()
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const catalogo = useQuery(consultaCatalogo(tipo, '', true))
  const itens = catalogo.data?.conteudo ?? []
  const { igual, contem, parecidos } = buscarNoCatalogo(texto, itens)
  const nomeNovo = nomeDeExibicao(texto)
  const podeCriar = normalizarNome(texto) !== '' && !igual

  const escolher = (item: Pick<ItemCatalogo, 'id' | 'nome'>) => {
    aoMudar({ id: item.id, nome: item.nome })
    setTexto('')
    setAberto(false)
    setConfirmando(false)
    setFalha(null)
  }

  const criar = async () => {
    setCriando(true)
    setFalha(null)
    try {
      const { item } = await criarItemDoCatalogo(tipo, nomeNovo)
      await cliente.invalidateQueries({ queryKey: ['catalogo', tipo] })
      escolher(item)
    } catch (e) {
      setFalha(mensagemDoErro(e))
    } finally {
      setCriando(false)
    }
  }

  if (valor) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="rotulo" id={`${id}-rotulo`}>
          {rotulo}
        </span>
        <div
          className="flex min-h-11 items-center gap-2 rounded-2 border border-linha-forte bg-rebaixo pl-2.5"
          aria-labelledby={`${id}-rotulo`}
          role="group"
          data-testid={`escolhido-${tipo}`}
        >
          <span className="min-w-0 flex-1 truncate text-15 text-texto" title={valor.nome}>
            {valor.nome}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Tirar ${rotulo.toLowerCase()}: ${valor.nome}`}
            onClick={() => aoMudar(null)}
          >
            <X aria-hidden="true" strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    )
  }

  const listaId = `${id}-lista`
  const mostrar = aberto && (texto !== '' || itens.length > 0)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={
          tipo === 'materiais' ? 'buscar ou criar material' : 'buscar ou criar ferramenta'
        }
        value={texto}
        onFocus={(e) => {
          setAberto(true)
          // celular: a lista de sugestões abre embaixo do campo e a barra fixa (Voltar, Checagem)
          // ocupa o fim da tela; o campo sobe até logo abaixo do cartão "o que fazer agora" (preso
          // no topo), e a lista fica à vista sem esconder o cartão
          if (window.matchMedia('(width < 64rem)').matches) {
            const cartao = document.querySelector('[data-cartao-fixo]')
            const topo = cartao ? Math.max(0, cartao.getBoundingClientRect().bottom) : 0
            const rotulo = e.currentTarget.parentElement ?? e.currentTarget
            window.scrollBy({ top: rotulo.getBoundingClientRect().top - topo - 8 })
          }
        }}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberto(true)
          setConfirmando(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setAberto(false)
            setConfirmando(false)
          } else if (e.key === 'Enter' && igual) {
            e.preventDefault()
            escolher(igual)
          }
        }}
        aria-invalid={erro ? true : undefined}
        className="min-h-11 text-15"
      />
      {mostrar ? (
        <div
          id={listaId}
          className="flex flex-col border border-linha-forte bg-modulo"
          data-testid={`opcoes-${tipo}`}
        >
          {catalogo.isPending ? (
            <span className="px-2.5 py-2 text-13 text-apoio">Carregando o catálogo…</span>
          ) : null}
          {igual ? <Opcao item={igual} aoEscolher={escolher} destaque="igual" /> : null}
          {contem.map((item) => (
            <Opcao key={item.id} item={item} aoEscolher={escolher} />
          ))}
          {parecidos.length > 0 ? (
            <>
              <span className="border-t border-linha px-2.5 pt-1.5 text-12 text-apoio">
                Não achei “{nomeNovo}”. Parecido:
              </span>
              {parecidos.map((item) => (
                <Opcao key={item.id} item={item} aoEscolher={escolher} destaque="parecido" />
              ))}
            </>
          ) : null}
          {!catalogo.isPending && itens.length === 0 && !texto ? (
            <span className="px-2.5 py-2 text-13 text-apoio">
              O catálogo está vazio. Digite o nome para criar o primeiro item.
            </span>
          ) : null}
          {podeCriar ? (
            confirmando ? (
              <div className="flex flex-col gap-2 border-t border-linha p-2.5" role="group">
                <p className="text-13 text-texto">
                  Criar “<span className="font-semibold">{nomeNovo}</span>” no catálogo de{' '}
                  {tipo === 'materiais' ? 'materiais' : 'ferramentas'}?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="default" onClick={() => void criar()} disabled={criando}>
                    {criando ? 'Criando…' : 'Confirmar e usar'}
                  </Button>
                  <Button onClick={() => setConfirmando(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex min-h-11 items-center gap-2 border-t border-linha px-2.5 text-left text-13 text-texto [@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce"
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 truncate">Criar “{nomeNovo}” no catálogo</span>
              </button>
            )
          ) : null}
          {falha ? <MensagemDoCampo id={`${id}-falha`} erro={falha} /> : null}
        </div>
      ) : null}
      <MensagemDoCampo id={`${id}-msg`} erro={erro} />
    </div>
  )
}

function Opcao({
  item,
  aoEscolher,
  destaque,
}: {
  item: ItemCatalogo
  aoEscolher: (item: ItemCatalogo) => void
  destaque?: 'igual' | 'parecido'
}) {
  return (
    <button
      type="button"
      onClick={() => aoEscolher(item)}
      className={cn(
        'flex min-h-11 items-center gap-2 px-2.5 text-left text-15 text-texto',
        '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-realce',
      )}
    >
      <span className="min-w-0 flex-1 truncate" title={item.nome}>
        {item.nome}
      </span>
      {destaque === 'parecido' ? (
        <span className="shrink-0 text-12 text-apoio">é esse?</span>
      ) : destaque === 'igual' ? (
        <span className="shrink-0 text-12 text-apoio">mesmo nome</span>
      ) : null}
      {item.descricao ? (
        <span className="max-w-40 shrink truncate text-12 text-apoio max-sm:hidden">
          {item.descricao}
        </span>
      ) : null}
    </button>
  )
}
