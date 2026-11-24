import { mensagemDoErro } from '@/api/erros'
import type { MaquinaAtualComEstado } from '@/hooks/useMaquinaAtual'

import { Botao, Carregando, Mensagem } from './Basicos'

/** Enquanto a lista de máquinas não chega, falhou ou veio vazia: diz isso, com "Tentar de novo". */
export function SemMaquina({ estado }: { estado: Exclude<MaquinaAtualComEstado, { situacao: 'pronta' }> }) {
  if (estado.situacao === 'carregando') return <Carregando />
  const acao = <Botao titulo="Tentar de novo" onPress={estado.tentar} />
  return estado.situacao === 'erro' ? (
    <Mensagem titulo="Não foi possível ler a máquina." acao={acao}>
      {mensagemDoErro(estado.erro)}
    </Mensagem>
  ) : (
    <Mensagem titulo="Nenhuma máquina cadastrada na API." acao={acao}>
      Cadastre a máquina no painel.
    </Mensagem>
  )
}
