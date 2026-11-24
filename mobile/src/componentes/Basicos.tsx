import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import type { Forma as NomeDaForma, Tom } from '@/dominio/estado'
import { useCores } from '@/hooks/basicos'

import { Forma, FormaComCor } from './Forma'
import { Texto } from './Texto'

/** Alvo mínimo de toque: 56 dp (luva, mão suja). */
export const ALVO_DE_TOQUE = 56

/** Cursor e seleção dos campos de texto no cinza do tema (sem a cor de destaque do sistema). */
export function useCoresDoCampo() {
  const cores = useCores()
  return { cursorColor: cores.texto, selectionColor: cores.realce, selectionHandleColor: cores.texto }
}

/** "Puxar para atualizar" no cinza do tema (sem a cor de destaque do sistema). */
export function useCoresDoAtualizar() {
  const cores = useCores()
  return { colors: [cores.apoio], tintColor: cores.apoio, progressBackgroundColor: cores.modulo }
}

// ------------------------------------------------------------------ selo de estado

const CLASSE_DO_SELO: Record<Tom, string> = {
  alarme: 'border-alarme bg-alarme',
  atencao: 'border-atencao bg-atencao',
  info: 'border-info',
  neutro: 'border-normal',
  apagado: 'border-linha-forte',
}

const TOM_DO_TEXTO_DO_SELO = {
  alarme: 'sobreAlarme',
  atencao: 'sobreAtencao',
  info: 'info',
  neutro: 'texto',
  apagado: 'fraco',
} as const

/** Estado em texto + forma + cor (ISA-101). Tracejado quando não é uma avaliação. */
export function SeloEstado({
  rotulo,
  forma,
  tom,
  tracejado = false,
  vazada,
}: {
  rotulo: string
  forma: NomeDaForma
  tom: Tom
  tracejado?: boolean
  vazada?: boolean
}) {
  // sobre fundo âmbar ou vermelho a forma vai no tom do texto do selo, para continuar visível
  const tomDaForma: Tom = tom === 'alarme' || tom === 'atencao' ? 'neutro' : tom
  return (
    <View
      className={`min-h-7 shrink flex-row items-center gap-1.5 self-start border px-1.5 py-0.5 ${CLASSE_DO_SELO[tom]}`}
      style={tracejado ? { borderStyle: 'dashed' } : null}
      testID={`selo-${rotulo}`}
    >
      {tom === 'alarme' || tom === 'atencao' ? (
        <FormaSobreCor forma={forma} tom={tom} />
      ) : (
        <Forma forma={forma} tom={tomDaForma} tamanho={13} vazada={vazada ?? tracejado} />
      )}
      <Texto tamanho="12" peso="forte" tom={TOM_DO_TEXTO_DO_SELO[tom]} className="shrink" style={{ letterSpacing: 0.8 }}>
        {rotulo}
      </Texto>
    </View>
  )
}

function FormaSobreCor({ forma, tom }: { forma: NomeDaForma; tom: 'alarme' | 'atencao' }) {
  const cores = useCores()
  return <FormaComCor forma={forma} cor={tom === 'alarme' ? cores.alarmeSobre : cores.atencaoSobre} />
}

// ------------------------------------------------------------------ módulo

/** Módulo da tela: sem cartão nem sombra; separado por linha de 1 px, com rótulo curto. */
export function Modulo({
  rotulo,
  acao,
  children,
  semRecuo = false,
  testID,
}: {
  rotulo?: string
  acao?: ReactNode
  children: ReactNode
  semRecuo?: boolean
  testID?: string
}) {
  return (
    <View className="border-b border-linha bg-modulo" testID={testID}>
      {rotulo ? (
        <View className="min-h-10 flex-row items-center justify-between gap-2 px-4 pt-3">
          <Texto rotulo accessibilityRole="header">
            {rotulo}
          </Texto>
          {acao}
        </View>
      ) : null}
      <View className={semRecuo ? '' : 'px-4 pt-2 pb-4'}>{children}</View>
    </View>
  )
}

/** Rótulo curto em cima, valor em Plex Mono embaixo, unidade menor e em cinza. */
export function Leitura({
  rotulo,
  valor,
  unidade,
  tamanho = '24',
  apagado = false,
  tom = 'texto',
  descricao,
}: {
  rotulo: string
  valor: string
  unidade?: string
  tamanho?: '18' | '24' | '32' | '40'
  apagado?: boolean
  tom?: 'texto' | 'atencao' | 'alarme'
  /** Texto para o leitor de tela; padrão: rótulo, valor e unidade. */
  descricao?: string
}) {
  const tamanhoDaUnidade = tamanho === '40' ? '24' : tamanho === '32' ? '18' : '13'
  return (
    <View accessible accessibilityLabel={descricao ?? `${rotulo} ${valor} ${unidade ?? ''}`.trim()}>
      <Texto rotulo>{rotulo}</Texto>
      <View className="flex-row items-baseline gap-1">
        <Texto familia="mono" peso="medio" tamanho={tamanho} tom={apagado ? 'fraco' : tom}>
          {valor}
        </Texto>
        {unidade ? (
          <Texto familia="mono" tamanho={tamanhoDaUnidade} tom={apagado ? 'fraco' : 'apoio'}>
            {unidade}
          </Texto>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Número medido dentro de uma linha de texto: Plex Mono no valor, unidade menor e em cinza. Vai dentro
 * de um Texto (aninhado), como em "Valor 0,412 g".
 */
export function ValorEmLinha({ valor, unidade }: { valor: string; unidade?: string | null }) {
  return (
    <>
      <Texto tamanho="13" familia="mono" peso="medio">
        {valor}
      </Texto>
      {unidade ? (
        <Texto tamanho="12" familia="mono" tom="apoio">
          {' '}
          {unidade}
        </Texto>
      ) : null}
    </>
  )
}

/** Barra grossa embaixo da opção marcada: a marca não depende só do tom do fundo. */
export function MarcaDaOpcao() {
  return <View className="absolute right-0 bottom-0 left-0 h-1 bg-texto" testID="marca-escolhida" />
}

// ------------------------------------------------------------------ botão

const AnimadoPressionavel = Animated.createAnimatedComponent(Pressable)

/**
 * Botão com alvo de 56 dp. Ao tocar, escala 0,97 em 100 ms e volta em 150 ms (a volta é mais lenta
 * que a ida para o toque parecer firme); com "reduzir movimento" a troca é instantânea. A ação
 * principal é preenchida em grafite; não existe cor de marca.
 */
export function Botao({
  titulo,
  variante = 'contorno',
  carregando = false,
  desabilitado = false,
  rotuloAcessivel,
  dica,
  onPress,
  testID,
}: {
  titulo: string
  variante?: 'acao' | 'contorno'
  carregando?: boolean
  desabilitado?: boolean
  rotuloAcessivel?: string
  dica?: string
  onPress?: PressableProps['onPress']
  testID?: string
}) {
  const cores = useCores()
  const escala = useSharedValue(1)
  const estilo = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }))
  const inativo = desabilitado || carregando
  const classe =
    variante === 'acao' && !inativo
      ? 'bg-acao border-acao'
      : inativo
        ? 'bg-rebaixo border-linha-forte'
        : 'bg-modulo border-linha-forte'
  return (
    <AnimadoPressionavel
      accessibilityRole="button"
      accessibilityLabel={rotuloAcessivel ?? titulo}
      accessibilityHint={dica}
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={onPress}
      onPressIn={() => {
        escala.set(withTiming(0.97, { duration: 100, reduceMotion: ReduceMotion.System }))
      }}
      onPressOut={() => {
        escala.set(withTiming(1, { duration: 150, reduceMotion: ReduceMotion.System }))
      }}
      testID={testID}
      className={`flex-row items-center justify-center gap-2 border px-4 ${classe}`}
      style={[
        { minHeight: ALVO_DE_TOQUE, borderRadius: 2 },
        inativo ? { borderStyle: 'dashed' } : null,
        estilo,
      ]}
    >
      {carregando ? <ActivityIndicator size="small" color={cores.apoio} /> : null}
      <Texto
        tamanho="15"
        peso="forte"
        tom={inativo ? 'fraco' : variante === 'acao' ? 'acao' : 'texto'}
        numberOfLines={2}
      >
        {titulo}
      </Texto>
    </AnimadoPressionavel>
  )
}

// ------------------------------------------------------------------ estados da tela

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  const cores = useCores()
  return (
    <View className="flex-row items-center gap-2 px-4 py-6" accessible accessibilityLabel={texto}>
      <ActivityIndicator size="small" color={cores.apoio} />
      <Texto tom="apoio">{texto}</Texto>
    </View>
  )
}

/** Mensagem neutra (sem vermelho: vermelho é só alarme da máquina), com ação opcional. */
export function Mensagem({
  titulo,
  children,
  acao,
}: {
  titulo: string
  children?: ReactNode
  acao?: ReactNode
}) {
  return (
    <View className="gap-2 px-4 py-6">
      <Texto peso="forte">{titulo}</Texto>
      {children ? <Texto tom="apoio">{children}</Texto> : null}
      {acao}
    </View>
  )
}

/**
 * Escolha entre poucas opções (tema, fonte dos dados, período): botões lado a lado, um marcado. O marcado
 * leva fundo rebaixado, texto forte e uma barra grossa embaixo: a marca não depende só do tom.
 */
export function Escolha<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
  colunas,
}: {
  opcoes: { valor: T; rotulo: string }[]
  valor: T
  aoMudar: (v: T) => void
  rotulo: string
  /** Com muitas opções (rotações), quebra em linhas de N; sem isto, todas numa linha. */
  colunas?: number
}) {
  return (
    <View
      className={colunas ? 'flex-row flex-wrap' : 'flex-row'}
      accessibilityRole="radiogroup"
      accessibilityLabel={rotulo}
    >
      {opcoes.map((o) => {
        const marcado = o.valor === valor
        return (
          <Pressable
            key={o.valor}
            onPress={() => aoMudar(o.valor)}
            accessibilityRole="radio"
            accessibilityState={{ checked: marcado }}
            accessibilityLabel={o.rotulo}
            className={`${colunas ? '' : 'flex-1 '}items-center justify-center border ${marcado ? 'border-linha-forte bg-rebaixo' : 'border-linha bg-modulo'}`}
            style={colunas ? { minHeight: ALVO_DE_TOQUE, width: `${100 / colunas}%` } : { minHeight: ALVO_DE_TOQUE }}
            testID={`escolha-${o.valor}`}
          >
            <Texto peso={marcado ? 'forte' : 'normal'} tom={marcado ? 'texto' : 'apoio'}>
              {o.rotulo}
            </Texto>
            {marcado ? <MarcaDaOpcao /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}
