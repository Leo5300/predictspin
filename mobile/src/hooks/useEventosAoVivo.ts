import { useQueryClient } from '@tanstack/react-query'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef } from 'react'

import { chaves } from '@/api/consultas'
import { assinarEventos } from '@/api/eventos'
import { agoraMonotonicoMs } from '@/api/relogio'
import type { AlertaSse } from '@/api/tipos'
import { ehAlarmeNovo, rotuloDaMedida } from '@/dominio/alarme'
import { definirTransporte } from '@/estado/aoVivo'
import { avisar } from '@/estado/avisos'

import { useAppAtivo } from './basicos'

function textoDoAlarmeNovo({ alerta }: AlertaSse): string {
  if (alerta.tipo === 'instrumento') return `Alerta de instrumento no ponto ${alerta.ponto}: confira o sensor.`
  const nivel = alerta.nivel === 'alarme' ? 'Alarme' : 'Atenção'
  return `${nivel} no ponto ${alerta.ponto} (${rotuloDaMedida(alerta.metrica)}), ${alerta.maquina}.`
}

/**
 * Eventos ao vivo da máquina atual, uma conexão para o app inteiro (a API aceita 4 por usuário). A
 * janela nova entra direto no cache; alerta e OS refazem as listas. Alarme novo: aviso curto no topo
 * e haptics de aviso, sem som. Com o app em segundo plano a conexão fecha; ao voltar, reconecta e
 * recarrega tudo.
 */
export function useEventosAoVivo(maquinaId: number | undefined, simulado: boolean) {
  const cliente = useQueryClient()
  const ativo = useAppAtivo()
  const estavaAtivo = useRef(ativo)

  useEffect(() => {
    if (ativo && !estavaAtivo.current) void cliente.invalidateQueries()
    estavaAtivo.current = ativo
  }, [ativo, cliente])

  useEffect(() => {
    if (!ativo || maquinaId === undefined) {
      definirTransporte('reconectando')
      return
    }
    return assinarEventos({
      maquinaId,
      simulado,
      aoReceberJanela: (janela) => {
        cliente.setQueryData(chaves.ultimaJanela(maquinaId, simulado), {
          janela,
          // a janela acabou de chegar à API: idade zero neste instante
          observacao: { idadeNaObservacaoS: 0, observadoEmMs: agoraMonotonicoMs() },
        })
        void cliente.invalidateQueries({ queryKey: chaves.avaliacao(maquinaId, simulado) })
      },
      aoReceberAlerta: (evento) => {
        void cliente.invalidateQueries({ queryKey: chaves.alarmes(evento.alerta.simulado) })
        void cliente.invalidateQueries({ queryKey: chaves.alarme(evento.alerta.id) })
        if (ehAlarmeNovo(evento.acao)) {
          avisar(textoDoAlarmeNovo(evento))
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined)
        }
      },
      aoReceberOrdemServico: (evento) => {
        void cliente.invalidateQueries({ queryKey: chaves.alarmes(evento.ordem.simulado) })
      },
      aoReceberRecuperacao: () => {
        void cliente.invalidateQueries({ queryKey: chaves.serieRecente(maquinaId, simulado) })
      },
      aoMudarEstado: definirTransporte,
    })
  }, [ativo, cliente, maquinaId, simulado])
}
