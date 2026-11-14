import { EstadoVazio } from '@/componentes/instrumento/Estados'
import { Modulo, Painel } from '@/componentes/instrumento/Modulo'

/**
 * Lugar da tela de Coleta (ensaios, cobertura e replay), que chega na parte B. A rota já existe e
 * já é restrita a ADMIN e TECNICO; a tela ainda não foi construída e diz isso.
 */
export function TelaColeta() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-18 font-semibold">Coleta</h1>
      <Painel className="max-w-2xl">
        <Modulo rotulo="Coleta" semRecuo>
          <EstadoVazio titulo="A tela de coleta ainda não foi construída.">
            Abrir e encerrar ensaios, acompanhar a cobertura e rever um ensaio gravado continuam
            disponíveis pela API. Esta área é restrita a administradores e técnicos.
          </EstadoVazio>
        </Modulo>
      </Painel>
    </div>
  )
}
