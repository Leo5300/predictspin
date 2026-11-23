import { Redirect } from 'expo-router'

import { useSessao } from '@/api/sessao'

/** Começo: com sessão, a máquina; sem sessão (ou verificando), a tela de entrada. */
export default function Inicio() {
  const sessao = useSessao()
  return <Redirect href={sessao.fase === 'autenticada' ? '/maquina' : '/entrar'} />
}
