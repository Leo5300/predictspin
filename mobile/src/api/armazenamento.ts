/**
 * Tudo que o app guarda no aparelho, e só isto (LGPD: o necessário): o token da sessão com a hora em
 * que vence, o e-mail para preencher a entrada, a preferência de tema, se a biometria está ligada e se a
 * pessoa adiou o pedido de notificação. O token de push não fica guardado: o Expo o entrega a cada sessão.
 * Fica no SecureStore (Keychain no iPhone, Keystore no Android), nunca em AsyncStorage. Senha nunca.
 */
import * as SecureStore from 'expo-secure-store'

export const CHAVES = {
  sessao: 'ps.sessao',
  email: 'ps.email',
  tema: 'ps.tema',
  biometria: 'ps.biometria',
  notificacoes: 'ps.notificacoes',
} as const

export type Chave = (typeof CHAVES)[keyof typeof CHAVES]

export async function ler(chave: Chave): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(chave)
  } catch {
    // chave invalidada (biometria trocada) ou armazenamento indisponível: segue sem o valor
    return null
  }
}

export async function gravar(chave: Chave, valor: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(chave, valor)
  } catch {
    /* sem armazenamento a informação vive só até fechar o app */
  }
}

export async function apagar(chave: Chave): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(chave)
  } catch {
    /* nada guardado */
  }
}
