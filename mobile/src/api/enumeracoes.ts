// Gerado por scripts/gerar-enumeracoes.mjs a partir de painel/openapi.json. Não edite à mão:
// rode "npm run api:tipos" depois de regenerar o contrato.

/** ConclusaoRequisicao.condicao_encontrada */
export const CONDICOES_ENCONTRADAS = ['normal', 'avanco_excessivo', 'rotacao_inadequada', 'ferramenta_desgastada', 'desbalanceamento', 'outra'] as const

/** ConclusaoRequisicao.retorno */
export const RETORNOS_TECNICOS = ['confirmada', 'rejeitada'] as const

/** NovoEnsaioRequisicao.etapa */
export const ETAPAS = ['T0', 'T1', 'T2', 'T3'] as const

/** NovoEnsaioRequisicao.condicao */
export const CONDICOES_DE_ENSAIO = ['normal', 'ferramenta_desgastada', 'avanco_excessivo', 'rotacao_inadequada', 'desbalanceamento', 'sensor_solto'] as const

/** NovoEventoMarcadoRequisicao.motivo */
export const MOTIVOS_DE_EVENTO = ['pancada', 'cavaco', 'maquina_vizinha', 'outro'] as const
