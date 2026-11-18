import { formatarCurtose, formatarG } from '@/dominio/formato'

import { Leitura } from './Leitura'

type Desvio = 'atencao' | 'alarme' | null

/** As medidas de um ponto numa janela (o que a tela da máquina mostra). */
export type MedidasDoPonto = {
  rms_g?: number | null
  pico_g?: number | null
  curtose?: number | null
  o1x?: number | null
  o2x?: number | null
  o3x?: number | null
}

/**
 * Leituras de um ponto: RMS em destaque e, embaixo, pico, curtose e as ordens 1X, 2X e 3X. Em contêiner
 * estreito (celular, 390 px) a grade fica em 2 colunas: com 3, o valor em desvio (forma do estado ao lado
 * do número) não cabia e cortava com reticências.
 */
export function LeiturasDoPonto({
  medida,
  desvio,
  velho,
}: {
  medida: MedidasDoPonto | undefined
  /** Desvio de cada medida pelo nome da API (rms_g, pico_g, o1x...). */
  desvio: (nome: string) => Desvio
  velho: boolean
}) {
  return (
    <div
      className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 @min-[28rem]:grid-cols-3"
      data-testid="leituras-do-ponto"
    >
      <Leitura
        rotulo="RMS"
        explica="rms"
        valor={formatarG(medida?.rms_g)}
        unidade="g"
        tamanho="destaque"
        desvio={desvio('rms_g')}
        velho={velho}
        className="col-span-2 @min-[28rem]:col-span-3"
      />
      <Leitura
        rotulo="Pico"
        explica="pico"
        valor={formatarG(medida?.pico_g)}
        desvio={desvio('pico_g')}
        unidade="g"
        tamanho="grande"
        velho={velho}
      />
      <Leitura
        rotulo="Curt"
        explica="curtose"
        titulo="curtose"
        valor={formatarCurtose(medida?.curtose)}
        tamanho="grande"
        velho={velho}
      />
      <Leitura
        rotulo="1X"
        explica="ordens"
        valor={formatarG(medida?.o1x)}
        desvio={desvio('o1x')}
        unidade="g"
        tamanho="grande"
        velho={velho}
      />
      <Leitura
        rotulo="2X"
        valor={formatarG(medida?.o2x)}
        desvio={desvio('o2x')}
        unidade="g"
        tamanho="grande"
        velho={velho}
      />
      <Leitura
        rotulo="3X"
        valor={formatarG(medida?.o3x)}
        desvio={desvio('o3x')}
        unidade="g"
        tamanho="grande"
        velho={velho}
      />
    </div>
  )
}
