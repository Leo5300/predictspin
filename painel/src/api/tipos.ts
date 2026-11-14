/**
 * Tipos do contrato da API. Nenhum é digitado à mão: todos vêm de esquema.d.ts, que é gerado de
 * painel/openapi.json ("npm run api:gerar"). Aqui só ficam nomes curtos para os esquemas.
 */
import type { components } from './esquema'

type Esquemas = components['schemas']

export type Usuario = Esquemas['UsuarioResposta']
export type RespostaLogin = Esquemas['LoginResposta']
export type Maquina = Esquemas['MaquinaResposta']
export type Ponto = Esquemas['PontoResposta']
export type Dispositivo = Esquemas['DispositivoResposta']
export type Janela = Esquemas['JanelaResposta']
export type JanelaPonto = Esquemas['JanelaPonto']
export type JanelaCanal = Esquemas['JanelaCanal']
export type UltimaJanela = Esquemas['UltimaJanelaResposta']
export type PaginaDeJanelas = Esquemas['PaginaJanelaResposta']
export type SerieAgregada = Esquemas['SerieAgregadaResposta']
export type SerieIntervalo = Esquemas['SerieIntervalo']
export type SeriePonto = Esquemas['SeriePonto']
export type ModoRapido = Esquemas['ModoRapidoResposta']
export type Ensaio = Esquemas['EnsaioResposta']
export type EnsaioEvento = Esquemas['EnsaioEvento']
export type ErroResposta = Esquemas['ErroResposta']
export type Papel = Usuario['papel']

/** A última janela e o item das listagens têm o mesmo conteúdo; só o nome do identificador muda. */
export function janelaDaUltima(ultima: UltimaJanela): Janela {
  return {
    id: ultima.janela_id,
    medido_em: ultima.medido_em,
    recebido_em: ultima.recebido_em,
    rotacao_rpm: ultima.rotacao_rpm,
    saturou: ultima.saturou,
    modo: ultima.modo,
    amostras: ultima.amostras,
    amostras_esperadas: ultima.amostras_esperadas,
    simulado: ultima.simulado,
    dispositivo: ultima.dispositivo,
    ensaio_id: ultima.ensaio_id,
    ensaio_codigo: ultima.ensaio_codigo,
    pontos: ultima.pontos,
    canais: ultima.canais,
  }
}
