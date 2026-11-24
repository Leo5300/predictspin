# Push de alarme no celular: APK de teste no Android

O app avisa no celular quando algo pede ação: alarme novo (todos os usuários), OS aberta e problema de sensor
(ADMIN e TECNICO). Atenção, normalização e reconhecimento não avisam. As regras de envio estão em
[`alarmes.md`](alarmes.md#notificação-no-celular-push); este documento cobre o lado do celular e os passos
manuais para ter push de verdade.

**Situação (24/11/2026):** o código do app e da API está pronto e testado com simulações (Jest no app, servidor
falso no lugar do Expo na API). **Nenhum push real foi enviado nem recebido**: não há conta Expo, projeto
Firebase nem APK ainda. Tudo abaixo é feito por você.

## Onde o push funciona

| Como o app está rodando | Push | O que a Conta mostra |
|---|---|---|
| Expo Go, Android ou iPhone (SDK 53 em diante) | não | "Notificações indisponíveis neste modo." |
| APK do perfil `preview` (Android), depois dos passos abaixo | sim | "Ligadas." |
| Build próprio no iPhone | só com conta paga do Apple Developer Program; fora deste projeto | — |
| Navegador | não | "Notificações indisponíveis neste modo." |

No Expo Go, todo o resto do app funciona igual; só não chega notificação.

## Como o app usa o push

- **Pedido depois do login.** Na primeira entrada, um quadro no topo pergunta "Avisar neste celular quando houver
  alarme?" e diz o que chega. Só depois de "Permitir" aparece a janela do sistema. "Agora não" não pergunta
  de novo; a Conta continua oferecendo "Ligar notificações".
- **Registro a cada sessão.** Com a permissão dada, o app pede ao Expo o token deste celular e o envia à API
  (`PUT /api/v1/push/aparelhos`). Ao sair, remove antes de apagar a sessão (`POST /api/v1/push/aparelhos/remover`,
  até 3 s de espera). O token não fica guardado no celular.
- **Toque abre o alarme.** Tocar na notificação abre o detalhe do alarme e troca a fonte dos dados para a do
  alarme (Real ou Simulado). Se a sessão estiver travada pela biometria, o alarme abre depois de destravar. A
  notificação de OS abre o detalhe da OS.
- **Com o app aberto**, a notificação aparece em faixa, sem som. O app mostra ao vivo só a fonte escolhida, e
  um alarme real não pode passar despercebido enquanto se olha o simulado.
- **Canal Android `alarmes`**, importância alta, criado antes de pedir a permissão (no Android 13 em diante, a
  janela do sistema só aparece se já existe um canal).

## O que fica onde

| Item | Onde fica | Por quê |
|---|---|---|
| `google-services.json` (Firebase) | fora do Git (`mobile/.gitignore`); no EAS, variável secreta do tipo arquivo `GOOGLE_SERVICES_JSON` | O repositório é público, e a chave do Firebase que está dentro dele dispara o alerta de segredo do GitHub. O `mobile/app.config.ts` lê a variável no EAS ou o arquivo local, se existir. |
| Chave da conta de serviço do Firebase (JSON da FCM V1) | só nas credenciais do EAS | Dá acesso ao envio pelo Firebase. Apague a cópia local depois de enviar. |
| Endereço da API do APK (`EXPO_PUBLIC_API_URL`) | variável do EAS, ambiente `preview`, visibilidade `sensitive` | Não entra em arquivo do repositório. Variável `EXPO_PUBLIC_` não pode ser `secret` e vai dentro do APK: quem tiver o APK consegue ler o endereço. Compartilhe o APK só com a turma. |
| Identificador do projeto no EAS (`extra.eas.projectId`) | `mobile/app.json`, gravado pelo `eas init` | Não é segredo; sem ele o celular não recebe token. |
| `EXPO_ACCESS_TOKEN` (opcional) | painel do Render | Só se você ligar a segurança de push no Expo (passo 9). É segredo. |

## Passos (uma vez)

Tudo dentro de `mobile/`, no PowerShell, com Node 24.

1. **Conta Expo e EAS CLI.** Crie a conta em expo.dev. Depois:

   ```powershell
   npm install -g eas-cli
   eas login
   ```

2. **Projeto no EAS.**

   ```powershell
   cd mobile
   eas init
   ```

   O comando cria o projeto e grava o identificador em `app.json` (`extra.eas.projectId`). Confira com
   `git diff app.json` e faça o commit dessa mudança.

3. **Firebase.** Em console.firebase.google.com, crie um projeto (o Analytics pode ficar desligado). Adicione um
   app Android com o pacote `br.senai.predictspin`. Baixe o `google-services.json` e salve em
   `mobile/google-services.json`. O `.gitignore` já o deixa fora do Git; confira com `git status`.

4. **`google-services.json` no EAS.** Em expo.dev, abra o projeto: Project settings > Environment variables >
   Add Variables. Nome `GOOGLE_SERVICES_JSON`, tipo arquivo (file), envie o `google-services.json`, visibilidade
   Secret, ambiente `preview`. O build do perfil `preview` usa o ambiente `preview` (`"environment"` no
   `eas.json`).

5. **Credencial FCM V1.** No Firebase: Configurações do projeto > Contas de serviço > Gerar nova chave privada.
   Depois:

   ```powershell
   eas credentials
   ```

   Escolha Android, o perfil `preview`, Google Service Account, "Manage your Google Service Account Key for Push
   Notifications (FCM V1)", "Set up a Google Service Account Key for Push Notifications (FCM V1)" e "Upload a
   new service account key". Pelo site também dá: Project settings > Credentials > Android > FCM V1 service
   account key. A chave vale para o pacote, em qualquer perfil. Depois de enviar, apague o JSON da chave do
   computador.

6. **Endereço da API no APK.** O APK é um build de produção e só aceita https: use o endereço da API no Render.

   ```powershell
   eas env:set --name EXPO_PUBLIC_API_URL --value <endereço https da API> --environment preview --visibility sensitive
   ```

7. **Build do APK** (na nuvem do EAS; no plano gratuito pode haver fila):

   ```powershell
   eas build -p android --profile preview
   ```

   No fim, o EAS mostra um link e um QR code para baixar o APK.

8. **Instalar no Android.** Abra o link no celular, baixe o APK e permita "instalar apps desconhecidos" para o
   navegador quando o Android pedir. O Play Protect pode avisar que o app não é verificado: "Instalar mesmo
   assim". Entre no app e aceite o pedido de notificação. Em Conta, deve aparecer "Ligadas.", ou "Este celular está
   registrado, mas o envio de push está desligado na API." enquanto o passo 9 não for feito.

9. **Ligar o envio na API.** No `render.yaml`, troque `PUSH_HABILITADO` de `"false"` para `"true"`, faça o
   commit e envie. Mudar só no painel do Render também funciona, mas uma sincronização do Blueprint pode voltar ao
   valor do `render.yaml`. Opcional: se ligar a exigência de token para envio de push no Expo
   (expo.dev/settings/access-tokens), crie um token e ponha em `EXPO_ACCESS_TOKEN` no painel do Render.

## Teste de ponta a ponta

Com o APK instalado, a sessão aberta e `PUSH_HABILITADO=true` no Render:

1. Rode o simulador apontado para a API do Render em modo severo, como na demonstração da banca. Quando um ponto
   entrar em alarme, deve chegar uma notificação "SIMULADO · ALARME · TORNO-01 · ponto ...".
2. Toque nela: o app abre o detalhe daquele alarme, com a fonte em Simulado.
3. Continue com o simulador em severo: o mesmo alarme não avisa de novo (um alarme, um push).
4. Como ADMIN, consulte `GET /api/v1/push/diagnostico`: enviados, falhos, tokens desativados e segurados pelo
   intervalo.
5. Saia do app e repita o passo 1: não deve chegar nada para este celular.

O roteiro com as colunas de resultado está em [`app-teste-celular.md`](app-teste-celular.md).

## Quando não funciona

| O que aparece | Causa provável |
|---|---|
| APK com "Notificações indisponíveis neste modo." | Build feito antes do `eas init` (sem `extra.eas.projectId` no `app.json`). Faça o passo 2 e gere o APK de novo. |
| "O celular não conseguiu o endereço de push." | Sem internet, ou APK sem o Firebase (`GOOGLE_SERVICES_JSON` faltando no ambiente `preview`). |
| "A API não registrou este celular." | API fora do ar ou acordando; toque em "Tentar de novo". |
| "Desligadas nas configurações do celular." | A permissão foi negada no sistema; "Abrir configurações" leva até ela. |
| "Ligadas." e nada chega | Veja os falhos no diagnóstico. Credencial FCM V1 ausente ou errada faz o Expo recusar o envio. |

## Limitações

- Se a sessão vencer sozinha (sem "Sair"), o app não tem mais um token válido para remover o aparelho: o
  celular continua recebendo push dessa conta até alguém entrar nele de novo (o mesmo token passa para quem
  entrar) ou até sair pelo botão.
- A API lê só a resposta imediata do Expo; o `DeviceNotRegistered` que chega depois, no recibo, não é consultado
  (ver [`alarmes.md`](alarmes.md#notificação-no-celular-push)).
- iPhone com push exige o Apple Developer Program (pago) e um build próprio; não está nos passos acima.
