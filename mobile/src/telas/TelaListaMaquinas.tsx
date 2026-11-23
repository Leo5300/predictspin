import { useQuery } from '@tanstack/react-query'
import { Redirect, router } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'

import { consultaMaquinas } from '@/api/consultas'
import { mensagemDoErro } from '@/api/erros'
import { ALVO_DE_TOQUE, Botao, Carregando, Mensagem } from '@/componentes/Basicos'
import { Cabecalho } from '@/componentes/Casca'
import { Texto } from '@/componentes/Texto'
import { escolherMaquina } from '@/hooks/useMaquinaAtual'

/** Lista de máquinas. Com uma só (hoje, o TORNO-01), abre direto nela. */
export function TelaListaMaquinas() {
  const maquinas = useQuery(consultaMaquinas())
  const ativas = (maquinas.data?.conteudo ?? []).filter((m) => m.ativa)
  if (ativas.length === 1 && ativas[0]) {
    return (
      <Redirect
        href={{ pathname: '/maquina/[maquinaId]', params: { maquinaId: String(ativas[0].id) } }}
      />
    )
  }
  return (
    <View className="flex-1 bg-fundo">
      <Cabecalho titulo="Máquinas" />
      {maquinas.isPending ? (
        <Carregando />
      ) : maquinas.isError ? (
        <Mensagem
          titulo="Não foi possível ler as máquinas."
          acao={<Botao titulo="Tentar de novo" onPress={() => void maquinas.refetch()} />}
        >
          {mensagemDoErro(maquinas.error)}
        </Mensagem>
      ) : ativas.length === 0 ? (
        <Mensagem titulo="Nenhuma máquina ativa cadastrada." />
      ) : (
        <ScrollView>
          {ativas.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => {
                escolherMaquina(m.id)
                router.push({ pathname: '/maquina/[maquinaId]', params: { maquinaId: String(m.id) } })
              }}
              accessibilityRole="button"
              accessibilityLabel={`${m.codigo}, ${m.modelo}`}
              className="justify-center border-b border-linha bg-modulo px-4"
              style={{ minHeight: ALVO_DE_TOQUE + 16 }}
            >
              <Texto familia="mono" peso="forte" tamanho="18">
                {m.codigo}
              </Texto>
              <Texto tamanho="13" tom="apoio">
                {m.modelo}
              </Texto>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
