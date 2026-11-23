/**
 * Biometria (digital ou rosto) só destrava o token já guardado; nunca guarda senha. A preferência
 * fica no aparelho: "ligada", "desligada" ou ainda não perguntada (nulo).
 *
 * No Expo Go do iPhone o Face ID não funciona (o Expo Go não declara a permissão); o sistema cai na
 * senha do aparelho. A digital no Android funciona no Expo Go.
 */
import * as LocalAuthentication from 'expo-local-authentication'

import { apagar, CHAVES, gravar, ler } from './armazenamento'

export type PreferenciaBiometria = 'ligada' | 'desligada' | null

export async function biometriaDisponivel(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
    )
  } catch {
    return false
  }
}

/** "digital", "rosto" ou "digital ou rosto", para os textos da tela. */
export async function nomeDaBiometria(): Promise<string> {
  try {
    const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync()
    const digital = tipos.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    const rosto = tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    if (digital && rosto) return 'digital ou rosto'
    if (rosto) return 'rosto'
    return 'digital'
  } catch {
    return 'digital ou rosto'
  }
}

export async function autenticarComBiometria(): Promise<boolean> {
  try {
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Destravar o PredictSpin',
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar a senha do aparelho',
    })
    return resultado.success
  } catch {
    return false
  }
}

export async function lerPreferenciaBiometria(): Promise<PreferenciaBiometria> {
  const valor = await ler(CHAVES.biometria)
  return valor === 'ligada' || valor === 'desligada' ? valor : null
}

export async function gravarPreferenciaBiometria(ligada: boolean): Promise<void> {
  await gravar(CHAVES.biometria, ligada ? 'ligada' : 'desligada')
}

export async function esquecerPreferenciaBiometria(): Promise<void> {
  await apagar(CHAVES.biometria)
}
