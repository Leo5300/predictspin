import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { listarAlarmes, listarOrdensDeServico } from '@/api/adaptadores/alarmes'
import { LinhaAlarme, LinhaOrdemServico } from '@/componentes/alarmes/LinhasDeAlarme'
import { EstadoCarregando, EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'

/**
 * Alarmes e ordens de serviço. Hoje a API não tem regra de alarme nem rota de alerta e de ordem de
 * serviço: a tela diz isso sem rodeio e o que vai aparecer aqui. Conversa só com o adaptador
 * (api/adaptadores/alarmes.ts), que não chama nenhuma rota; nenhum item de exemplo é mostrado.
 */
export function TelaAlarmes() {
  const alarmes = useQuery({ queryKey: ['alarmes'], queryFn: listarAlarmes })
  const ordens = useQuery({ queryKey: ['ordens-servico'], queryFn: listarOrdensDeServico })
  useEffect(() => {
    document.title = 'Alarmes · PredictSpin'
  }, [])
  return (
    <div className="flex flex-col gap-3">
      <header>
        <h1 className="text-24 font-semibold">Alarmes e ordens de serviço</h1>
      </header>
      <Painel className="lg:grid-cols-2">
        <Modulo rotulo="Alarmes" semRecuo>
          {alarmes.isPending ? (
            <EstadoCarregando />
          ) : alarmes.data?.disponivel ? (
            <ul>
              {alarmes.data.itens.map((a) => (
                <LinhaAlarme key={a.id} alarme={a} />
              ))}
            </ul>
          ) : (
            <EstadoVazio titulo="A regra de alarme ainda não foi implantada na API.">
              Por isso não há alarme nesta tela, e não por falta de problema na máquina. Quando a
              API aprender a referência de cada ponto e cada rotação, aparecerão aqui os alarmes de
              ATENÇÃO e ALARME de cada ponto, com o valor, quando começou, a ação recomendada e o
              estado (não reconhecido, reconhecido, normalizado, suprimido). Reconhecer será
              segurando o botão.
            </EstadoVazio>
          )}
        </Modulo>
        <Modulo rotulo="Ordens de serviço" semRecuo>
          {ordens.isPending ? (
            <EstadoCarregando />
          ) : ordens.data?.disponivel ? (
            <ul>
              {ordens.data.itens.map((o) => (
                <LinhaOrdemServico key={o.id} ordem={o} />
              ))}
            </ul>
          ) : (
            <EstadoVazio titulo="Ainda não há ordens de serviço na API.">
              Elas nascerão dos alarmes confirmados. Cada uma trará a ação recomendada em destaque
              (uma frase do que fazer), o componente provável e o retorno do técnico (confirmada ou
              rejeitada), que ensina o modelo.
            </EstadoVazio>
          )}
        </Modulo>
      </Painel>
    </div>
  )
}
