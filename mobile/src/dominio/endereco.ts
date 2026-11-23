/**
 * Endereço da API que o app usa (EXPO_PUBLIC_API_URL). Fora do desenvolvimento, só https. Em
 * desenvolvimento, http só para a rede local (localhost, 10.x, 172.16-31.x, 192.168.x), que é onde
 * roda a API do docker compose no notebook.
 */

export type EnderecoDaApi =
  | { ok: true; url: string; local: boolean }
  | { ok: false; motivo: 'ausente' | 'invalido' | 'sem_https' }

function ehRedeLocal(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2') return true
  const partes = host.split('.').map(Number)
  if (partes.length !== 4 || partes.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false
  const [a = 0, b = 0] = partes
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export function lerEnderecoDaApi(
  valor: string | null | undefined,
  desenvolvimento: boolean,
): EnderecoDaApi {
  const texto = valor?.trim()
  if (!texto) return { ok: false, motivo: 'ausente' }
  const m = /^(https?):\/\/([^/:?#]+)(:\d+)?(\/[^?#]*)?$/i.exec(texto)
  if (!m) return { ok: false, motivo: 'invalido' }
  const protocolo = (m[1] ?? '').toLowerCase()
  const host = (m[2] ?? '').toLowerCase()
  const local = ehRedeLocal(host)
  if (protocolo === 'http' && !(desenvolvimento && local)) return { ok: false, motivo: 'sem_https' }
  return { ok: true, url: texto.replace(/\/+$/, ''), local }
}

export const MENSAGEM_DO_ENDERECO: Record<'ausente' | 'invalido' | 'sem_https', string> = {
  ausente:
    'Endereço da API não configurado. Preencha EXPO_PUBLIC_API_URL em mobile/.env e abra o app de novo.',
  invalido: 'O endereço da API em EXPO_PUBLIC_API_URL não é um endereço http(s) válido.',
  sem_https:
    'O endereço da API precisa ser https. http só vale em desenvolvimento e na rede local (IP do notebook).',
}
