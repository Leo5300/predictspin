import type { SegundaOpiniao } from '@/api/adaptadores/modelos'
import { Explica } from '@/componentes/ui/explica'
import { decimal2, resumoDaOpiniao } from '@/dominio/modelos'

/**
 * Segunda opinião do modelo, em texto e números, sem cor de sinal: quem acende atenção e alarme é a regra; o
 * modelo só acrescenta uma estimativa. Modelo de dado simulado leva o aviso "dado simulado: não é resultado".
 */
export function BlocoSegundaOpiniao({
  titulo,
  opiniao,
}: {
  titulo: string
  opiniao: SegundaOpiniao | null | undefined
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="rotulo flex items-center gap-1">
        {titulo}
        <Explica chave="modelo" />
      </p>
      {!opiniao ? (
        <p className="text-13 text-apoio">
          Sem segunda opinião: nenhum modelo ativo para este tipo de dado quando o alerta abriu.
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-13">
          <dt className="text-apoio">
            Classe provável <Explica chave="classe_provavel" className="inline-flex" />
          </dt>
          <dd className="text-texto">{resumoDaOpiniao(opiniao)}</dd>
          <dt className="text-apoio">
            Escore <Explica chave="escore_anomalia" className="inline-flex" />
          </dt>
          <dd className="text-texto">
            <span className="valor">{decimal2(opiniao.escore)}</span> (limite{' '}
            <span className="valor">{decimal2(opiniao.limiar)}</span>) · {opiniao.concordancia}
          </dd>
          <dt className="text-apoio">Modelo</dt>
          <dd className="text-texto">
            versão {opiniao.versao}
            {opiniao.simulado ? ' · dado simulado: não é resultado' : ''}
          </dd>
          <dt className="text-apoio">Por quê</dt>
          <dd className="text-texto [overflow-wrap:anywhere]">{opiniao.explicacao}</dd>
        </dl>
      )}
    </div>
  )
}
