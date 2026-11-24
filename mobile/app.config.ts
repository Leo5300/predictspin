/**
 * Configuração dinâmica: tudo vem do app.json; aqui só entra o arquivo do Firebase (google-services.json),
 * que o Android precisa para receber push. Ele fica fora do Git (repositório público): no EAS Build vem
 * da variável de arquivo GOOGLE_SERVICES_JSON; no notebook, do arquivo local, se existir. Sem ele o app
 * funciona igual, só sem push no Android. Passos em docs/app-push.md.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ConfigContext, ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => {
  const local = join(__dirname, 'google-services.json')
  const arquivo = process.env.GOOGLE_SERVICES_JSON ?? (existsSync(local) ? './google-services.json' : undefined)
  const base = config as ExpoConfig
  return arquivo ? { ...base, android: { ...base.android, googleServicesFile: arquivo } } : base
}
