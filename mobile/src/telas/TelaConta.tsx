import { useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Linking, ScrollView, View } from 'react-native'

import { sair } from '@/api/autenticacao'
import {
  biometriaDisponivel,
  gravarPreferenciaBiometria,
  lerPreferenciaBiometria,
  nomeDaBiometria,
} from '@/api/biometria'
import { ENDERECO_DA_API, URL_API } from '@/api/configuracao'
import { atualizarRegistro, pedirPermissao, useEstadoDoPush } from '@/api/push'
import { useSessao } from '@/api/sessao'
import { Botao, Carregando, Escolha, Modulo } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { Texto } from '@/componentes/Texto'
import { resumoDoPush, type ResumoDoPush } from '@/dominio/notificacao'
import { pode, ROTULO_PAPEL, type Papel } from '@/dominio/permissoes'
import {
  definirFonte,
  definirTema,
  useFonte,
  usePreferenciaTema,
  type Fonte,
  type PreferenciaTema,
} from '@/estado/preferencias'

function Par({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <View className="flex-row justify-between gap-3 py-1.5">
      <Texto tom="apoio">{rotulo}</Texto>
      <Texto className="flex-1 text-right">{children}</Texto>
    </View>
  )
}

/** Notificações deste celular: o estado e, quando cabe, o botão que resolve. */
function ModuloNotificacoes({ papel }: { papel: Papel }) {
  const estado = useEstadoDoPush()
  const [ocupado, setOcupado] = useState(false)
  const agir = (acao: () => Promise<void>) => {
    setOcupado(true)
    void acao().finally(() => setOcupado(false))
  }
  return (
    <QuadroDeNotificacoes
      resumo={resumoDoPush(estado, papel)}
      ocupado={ocupado}
      aoLigar={() => agir(pedirPermissao)}
      aoTentar={() => agir(atualizarRegistro)}
    />
  )
}

/** O módulo Notificações da Conta, sem estado: o texto, o porquê e o botão que cabe. */
export function QuadroDeNotificacoes({
  resumo,
  ocupado,
  aoLigar,
  aoTentar,
}: {
  resumo: ResumoDoPush
  ocupado: boolean
  aoLigar: () => void
  aoTentar: () => void
}) {
  return (
    <Modulo rotulo="Notificações" testID="modulo-notificacoes">
      <Texto peso="medio" testID="estado-notificacoes">
        {resumo.texto}
      </Texto>
      {resumo.detalhe ? (
        <Texto tamanho="13" tom="apoio" className="mt-1">
          {resumo.detalhe}
        </Texto>
      ) : null}
      {resumo.acao === 'ligar' ? (
        <View className="mt-3">
          <Botao
            titulo="Ligar notificações"
            carregando={ocupado}
            dica="Abre o pedido de permissão do sistema"
            onPress={aoLigar}
            testID="ligar-notificacoes"
          />
        </View>
      ) : resumo.acao === 'configuracoes' ? (
        <View className="mt-3">
          <Botao
            titulo="Abrir configurações"
            onPress={() => void Linking.openSettings()}
            testID="abrir-configuracoes"
          />
        </View>
      ) : resumo.acao === 'tentar' ? (
        <View className="mt-3">
          <Botao
            titulo="Tentar de novo"
            carregando={ocupado}
            onPress={aoTentar}
            testID="tentar-notificacoes"
          />
        </View>
      ) : null}
    </Modulo>
  )
}

/** Saúde da API (/actuator/health). A API não publica a versão dela; só o estado. */
function useSaudeDaApi() {
  return useQuery({
    queryKey: ['saude-da-api'],
    queryFn: async () => {
      const resposta = await fetch(`${URL_API}/actuator/health`, { headers: { Accept: 'application/json' } })
      const corpo: unknown = await resposta.json().catch(() => null)
      const status =
        typeof corpo === 'object' && corpo !== null && 'status' in corpo && typeof corpo.status === 'string'
          ? corpo.status
          : null
      return { ok: resposta.ok && status === 'UP', status }
    },
    enabled: ENDERECO_DA_API.ok,
    retry: false,
  })
}

/** Conta: usuário e papel, tema, fonte dos dados, biometria, notificações, modelos (ADMIN), versões e sair. */
export function TelaConta() {
  const sessao = useSessao()
  const tema = usePreferenciaTema()
  const fonte = useFonte()
  const saude = useSaudeDaApi()
  const [biometria, setBiometria] = useState<{ disponivel: boolean; ligada: boolean; nome: string } | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const disponivel = await biometriaDisponivel()
      const ligada = (await lerPreferenciaBiometria()) === 'ligada'
      const nome = await nomeDaBiometria()
      if (vivo) setBiometria({ disponivel, ligada, nome })
    })()
    return () => {
      vivo = false
    }
  }, [])

  if (sessao.fase !== 'autenticada') return null
  const { usuario } = sessao

  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo="Conta" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} testID="tela-conta">
        <Modulo rotulo="Usuário">
          <Texto tamanho="18" peso="forte">
            {usuario.nome}
          </Texto>
          <Texto tom="apoio">{usuario.email}</Texto>
          <Texto className="mt-1" testID="papel">
            {ROTULO_PAPEL[usuario.papel]}
          </Texto>
        </Modulo>
        <Modulo rotulo="Tema">
          <Escolha<PreferenciaTema>
            rotulo="Tema"
            valor={tema}
            aoMudar={(v) => void definirTema(v)}
            opcoes={[
              { valor: 'sistema', rotulo: 'Sistema' },
              { valor: 'claro', rotulo: 'Claro' },
              { valor: 'escuro', rotulo: 'Escuro' },
            ]}
          />
        </Modulo>
        <Modulo rotulo="Fonte dos dados">
          <Escolha<Fonte>
            rotulo="Fonte dos dados"
            valor={fonte}
            aoMudar={definirFonte}
            opcoes={[
              { valor: 'real', rotulo: 'Real' },
              { valor: 'simulado', rotulo: 'Simulado' },
            ]}
          />
          <Texto tamanho="13" tom="apoio" className="mt-2">
            Real e simulado nunca se misturam. Ao abrir, o app sempre começa em Real.
          </Texto>
        </Modulo>
        <Modulo rotulo="Entrar com biometria">
          {biometria === null ? (
            <Carregando texto="Conferindo a biometria do aparelho…" />
          ) : biometria.disponivel ? (
            <>
              <Escolha<'ligada' | 'desligada'>
                rotulo={`Entrar com ${biometria.nome}`}
                valor={biometria.ligada ? 'ligada' : 'desligada'}
                aoMudar={(v) => {
                  const ligada = v === 'ligada'
                  setBiometria({ ...biometria, ligada })
                  void gravarPreferenciaBiometria(ligada)
                }}
                opcoes={[
                  { valor: 'ligada', rotulo: 'Ligada' },
                  { valor: 'desligada', rotulo: 'Desligada' },
                ]}
              />
              <Texto tamanho="13" tom="apoio" className="mt-2">
                A {biometria.nome} só destrava a sessão guardada neste aparelho. A senha nunca fica guardada.
              </Texto>
            </>
          ) : (
            <Texto tom="apoio">Este aparelho não tem digital ou rosto cadastrados.</Texto>
          )}
        </Modulo>
        <ModuloNotificacoes papel={usuario.papel} />
        {pode(usuario.papel, 'ver_modelos') ? (
          <Modulo rotulo="Modelos da IA">
            <Texto tamanho="13" tom="apoio" className="mb-3">
              Versões treinadas, métricas da validação e qual dá a segunda opinião.
            </Texto>
            <Botao
              titulo="Ver versões"
              onPress={() => router.push('/conta/modelos')}
              testID="abrir-modelos"
            />
          </Modulo>
        ) : null}
        <Modulo rotulo="Versões">
          <Par rotulo="App">{Constants.expoConfig?.version ?? '—'}</Par>
          <Par rotulo="API">
            {saude.isPending
              ? 'consultando…'
              : saude.data?.ok
                ? 'no ar (health UP)'
                : 'sem resposta do health'}
          </Par>
          <Par rotulo="Endereço">
            {ENDERECO_DA_API.ok ? (ENDERECO_DA_API.local ? 'rede local (http)' : 'remoto (https)') : 'não configurado'}
          </Par>
          <Texto tamanho="12" tom="fraco" className="mt-1">
            A API não publica o número da versão; o health diz só se ela está no ar.
          </Texto>
        </Modulo>
        {__DEV__ ? (
          <View className="px-4 pt-6">
            <Botao titulo="Galeria de estados (desenvolvimento)" onPress={() => router.push('/galeria')} />
          </View>
        ) : null}
        <View className="px-4 pt-6">
          <Botao titulo="Sair" onPress={() => void sair()} dica="Apaga a sessão deste aparelho" testID="botao-sair" />
        </View>
      </ScrollView>
    </View>
  )
}
