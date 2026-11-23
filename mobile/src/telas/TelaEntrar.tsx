import { useEffect, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { abrirSessaoGuardada, destravar, emailLembrado, entrar } from '@/api/autenticacao'
import { gravarPreferenciaBiometria, nomeDaBiometria } from '@/api/biometria'
import { ENDERECO_DA_API } from '@/api/configuracao'
import { ErroApi, ErroRede, mensagemDoErro } from '@/api/erros'
import { encerrarSessao, useSessao } from '@/api/sessao'
import { ALVO_DE_TOQUE, Botao, Carregando } from '@/componentes/Basicos'
import { Texto } from '@/componentes/Texto'
import { esperaDaTentativaS, TEMPO_PARA_ACORDAR_S } from '@/dominio/conexao'
import { MENSAGEM_DO_ENDERECO } from '@/dominio/endereco'
import { formatarEspera } from '@/dominio/formato'

/** Mensagem da tela de entrada a partir do erro do login. */
export function mensagemDoLogin(erro: unknown): string {
  if (erro instanceof ErroApi && erro.status === 401) return 'E-mail ou senha errados.'
  if (erro instanceof ErroApi && erro.status === 429) {
    return erro.esperarS !== null
      ? `Muitas tentativas. Tente de novo em ${formatarEspera(erro.esperarS)}.`
      : 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  }
  if (erro instanceof ErroApi && erro.status === 400) return 'Preencha o e-mail e a senha.'
  return mensagemDoErro(erro)
}

/**
 * Servidor acordando: quanto esperar até a próxima tentativa de entrar, com espera crescente, até o
 * tempo que ele costuma levar para acordar; depois disso, nulo (para de tentar sozinho).
 */
export function proximaTentativa(
  atual: { inicio: number; n: number } | null,
  agora = Date.now(),
): { estado: { inicio: number; n: number }; esperaMs: number | null } {
  const estado = { inicio: atual?.inicio ?? agora, n: (atual?.n ?? 0) + 1 }
  const dentro = agora - estado.inicio < TEMPO_PARA_ACORDAR_S * 1000
  return { estado, esperaMs: dentro ? esperaDaTentativaS(estado.n) * 1000 : null }
}

/**
 * Só em desenvolvimento: quando o erro não é nem resposta da API nem falha de rede (a mensagem seria o
 * "Algo saiu errado" genérico), mostra o erro técnico para achar a causa. Em produção não muda nada.
 */
function comDetalheDeDesenvolvimento(mensagem: string, erro: unknown): string {
  if (!__DEV__ || erro instanceof ErroApi || erro instanceof ErroRede) return mensagem
  const tecnico = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro)
  return `${mensagem}\n[dev] ${tecnico.slice(0, 240)}`
}

function Moldura({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-fundo"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View className="gap-1 px-6 pb-6">
          <Texto rotulo>Monitoramento de vibração · torno</Texto>
          <Texto tamanho="32" peso="forte" accessibilityRole="header">
            PredictSpin
          </Texto>
        </View>
        <View className="border-y border-linha bg-modulo px-6 py-6">{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/** Abrindo o app: confere a sessão guardada; com o servidor dormindo, tenta de novo sozinho. */
function Verificando() {
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [desistiu, setDesistiu] = useState(false)
  const [rodada, setRodada] = useState(0)

  useEffect(() => {
    let vivo = true
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const inicio = Date.now()
    let tentativa = 0
    const tentar = async () => {
      try {
        await abrirSessaoGuardada()
      } catch (erro) {
        if (!vivo) return
        tentativa += 1
        const acordando = erro instanceof ErroRede && erro.acordando
        if (acordando && Date.now() - inicio < TEMPO_PARA_ACORDAR_S * 1000) {
          setMensagem(mensagemDoErro(erro))
          temporizador = setTimeout(() => void tentar(), esperaDaTentativaS(tentativa) * 1000)
        } else {
          setMensagem(comDetalheDeDesenvolvimento(mensagemDoErro(erro), erro))
          setDesistiu(true)
        }
      }
    }
    void tentar()
    return () => {
      vivo = false
      clearTimeout(temporizador)
    }
  }, [rodada])

  return (
    <Moldura>
      {mensagem ? (
        <View className="gap-4" accessibilityLiveRegion="polite">
          <Texto peso="medio">{mensagem}</Texto>
          {desistiu ? (
            <>
              <Botao
                titulo="Tentar de novo"
                variante="acao"
                onPress={() => {
                  setDesistiu(false)
                  setMensagem(null)
                  setRodada((r) => r + 1)
                }}
              />
              <Botao titulo="Entrar com e-mail e senha" onPress={() => void encerrarSessao(null)} />
            </>
          ) : (
            <Carregando texto="Tentando de novo…" />
          )}
        </View>
      ) : (
        <Carregando texto="Conferindo a sessão guardada…" />
      )}
    </Moldura>
  )
}

/** Sessão guardada e biometria ligada: destrava com digital ou rosto, ou entra com a senha. */
function Travada() {
  const [nome, setNome] = useState('digital ou rosto')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pediu = useRef(false)

  const tentar = async () => {
    setOcupado(true)
    setMensagem(null)
    try {
      const ok = await destravar()
      if (!ok) setMensagem('Não destravou. Tente de novo ou entre com e-mail e senha.')
    } catch (erro) {
      setMensagem(mensagemDoErro(erro))
    } finally {
      setOcupado(false)
    }
  }

  useEffect(() => {
    void nomeDaBiometria().then(setNome)
    if (!pediu.current) {
      pediu.current = true
      void tentar()
    }
  }, [])

  return (
    <Moldura>
      <View className="gap-4">
        <Texto>Há uma sessão guardada neste aparelho.</Texto>
        {mensagem ? (
          <Texto peso="medio" accessibilityLiveRegion="polite">
            {mensagem}
          </Texto>
        ) : null}
        <Botao
          titulo={`Destravar com ${nome}`}
          variante="acao"
          carregando={ocupado}
          onPress={() => void tentar()}
        />
        <Botao titulo="Entrar com e-mail e senha" onPress={() => void encerrarSessao(null)} />
      </View>
    </Moldura>
  )
}

function perguntarBiometria(nome: string) {
  Alert.alert(
    `Usar ${nome} para entrar?`,
    `Da próxima vez, o app pede a ${nome} em vez da senha. A senha nunca fica guardada. Dá para desligar em Conta.`,
    [
      { text: 'Agora não', style: 'cancel', onPress: () => void gravarPreferenciaBiometria(false) },
      { text: 'Usar', onPress: () => void gravarPreferenciaBiometria(true) },
    ],
    { cancelable: false },
  )
}

/** Formulário de entrada: e-mail lembrado (não a senha), mostrar/ocultar senha, erros claros. */
function Formulario({ aviso }: { aviso: string | null }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const tentativas = useRef<{ inicio: number; n: number } | null>(null)
  const repetir = useRef<ReturnType<typeof setTimeout> | null>(null)
  const senhaRef = useRef<React.ComponentRef<typeof TextInput>>(null)

  useEffect(() => {
    void emailLembrado().then((lembrado) => setEmail((atual) => atual || lembrado))
    return () => {
      if (repetir.current) clearTimeout(repetir.current)
    }
  }, [])

  const enviar = async () => {
    if (!email.trim() || !senha) {
      setMensagem('Preencha o e-mail e a senha.')
      return
    }
    if (repetir.current) clearTimeout(repetir.current)
    setOcupado(true)
    setMensagem(null)
    try {
      const resultado = await entrar(email.trim(), senha)
      tentativas.current = null
      if (resultado.perguntarBiometria) perguntarBiometria(await nomeDaBiometria())
    } catch (erro) {
      setMensagem(comDetalheDeDesenvolvimento(mensagemDoLogin(erro), erro))
      // servidor dormindo: nova tentativa sozinha, com espera crescente, por até ~2,5 min
      if (erro instanceof ErroRede && erro.acordando) {
        const proxima = proximaTentativa(tentativas.current)
        tentativas.current = proxima.estado
        if (proxima.esperaMs !== null) {
          repetir.current = setTimeout(() => void enviar(), proxima.esperaMs)
        }
      } else {
        tentativas.current = null
      }
    } finally {
      setOcupado(false)
    }
  }

  if (!ENDERECO_DA_API.ok) {
    return (
      <Moldura>
        <View className="gap-2" accessible accessibilityRole="alert" testID="sem-endereco">
          <Texto peso="forte">Endereço da API não configurado</Texto>
          <Texto tom="apoio">{MENSAGEM_DO_ENDERECO[ENDERECO_DA_API.motivo]}</Texto>
        </View>
      </Moldura>
    )
  }

  return (
    <Moldura>
      <View className="gap-4">
        {aviso ? (
          <View className="border border-linha-forte bg-rebaixo px-3 py-2" style={{ borderStyle: 'dashed' }}>
            <Texto peso="medio" accessibilityRole="alert">
              {aviso}
            </Texto>
          </View>
        ) : null}
        <View className="gap-1">
          <Texto rotulo nativeID="rotulo-email">
            E-mail
          </Texto>
          <TextInput
            accessibilityLabel="E-mail"
            accessibilityLabelledBy="rotulo-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => senhaRef.current?.focus()}
            maxFontSizeMultiplier={1.3}
            className="border border-linha-forte bg-rebaixo px-3 font-sans text-18 text-texto"
            style={{ minHeight: ALVO_DE_TOQUE }}
            testID="campo-email"
          />
        </View>
        <View className="gap-1">
          <Texto rotulo nativeID="rotulo-senha">
            Senha
          </Texto>
          <View className="flex-row">
            <TextInput
              ref={senhaRef}
              accessibilityLabel="Senha"
              accessibilityLabelledBy="rotulo-senha"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry={!mostrar}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void enviar()}
              maxFontSizeMultiplier={1.3}
              className="flex-1 border border-linha-forte bg-rebaixo px-3 font-sans text-18 text-texto"
              style={{ minHeight: ALVO_DE_TOQUE }}
              testID="campo-senha"
            />
            <Pressable
              onPress={() => setMostrar((m) => !m)}
              accessibilityRole="button"
              accessibilityLabel={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
              className="items-center justify-center border border-l-0 border-linha-forte bg-modulo px-3"
              style={{ minHeight: ALVO_DE_TOQUE, minWidth: 88 }}
              testID="mostrar-senha"
            >
              <Texto tamanho="13" peso="medio">
                {mostrar ? 'Ocultar' : 'Mostrar'}
              </Texto>
            </Pressable>
          </View>
        </View>
        {mensagem ? (
          <View
            className="border border-linha-forte px-3 py-2"
            style={{ borderStyle: 'dashed' }}
            accessibilityLiveRegion="polite"
            testID="mensagem-login"
          >
            <Texto peso="medio">{mensagem}</Texto>
          </View>
        ) : null}
        <Botao
          titulo="Entrar"
          variante="acao"
          carregando={ocupado}
          onPress={() => void enviar()}
          testID="botao-entrar"
        />
      </View>
    </Moldura>
  )
}

export function TelaEntrar() {
  const sessao = useSessao()
  if (sessao.fase === 'verificando') return <Verificando />
  if (sessao.fase === 'travada') return <Travada />
  return <Formulario aviso={sessao.fase === 'anonima' ? sessao.aviso : null} />
}
