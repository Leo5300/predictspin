/**
 * Tipos do contrato da API. Nenhum é digitado à mão: todos vêm de esquema.d.ts, gerado de
 * painel/openapi.json ("npm run api:tipos"). Aqui só ficam nomes curtos.
 */
import type { components } from './esquema'

type Esquemas = components['schemas']

export type Usuario = Esquemas['UsuarioResposta']
export type RespostaLogin = Esquemas['LoginResposta']
export type Maquina = Esquemas['MaquinaResposta']
export type Ponto = Esquemas['PontoResposta']
export type Janela = Esquemas['JanelaResposta']
export type JanelaPonto = Esquemas['JanelaPonto']
export type UltimaJanela = Esquemas['UltimaJanelaResposta']
export type SerieAgregada = Esquemas['SerieAgregadaResposta']
export type Avaliacao = Esquemas['AvaliacaoResposta']
export type PontoAvaliado = Esquemas['PontoAvaliado']
export type Limites = Esquemas['LimitesResposta']
export type Alarme = Esquemas['AlertaResposta']
export type AlarmeDetalhe = Esquemas['AlertaDetalheResposta']
export type Mudanca = Esquemas['Mudanca']
export type SegundaOpiniao = Esquemas['SegundaOpiniao']
export type ErroResposta = Esquemas['ErroResposta']
export type AlertaSse = Esquemas['AlertaEvento']
export type OrdemServicoSse = Esquemas['OrdemServicoEvento']
export type ModoRapido = Esquemas['ModoRapidoResposta']
export type OrdemServico = Esquemas['OrdemServicoResposta']
export type ConclusaoOrdem = Esquemas['ConclusaoRequisicao']
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
