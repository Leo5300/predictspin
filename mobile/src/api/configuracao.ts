/**
 * Endereço da API, lido de EXPO_PUBLIC_API_URL (mobile/.env, fora do Git). Sem ele o app monta do
 * mesmo jeito (a CI não tem .env) e a tela de entrada avisa que o endereço não foi configurado.
 */
import { lerEnderecoDaApi } from '@/dominio/endereco'

export const ENDERECO_DA_API = lerEnderecoDaApi(process.env.EXPO_PUBLIC_API_URL, __DEV__)

/** Base das chamadas; um endereço que não resolve quando a API não está configurada. */
export const URL_API = ENDERECO_DA_API.ok ? ENDERECO_DA_API.url : 'http://api-nao-configurada.invalid'
