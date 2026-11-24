# Aplicativo (React Native, `mobile/`): parte A

O app é um cliente da API, como o painel: nenhum dado falso dentro dele e nenhuma regra de alarme
recalculada nele. A API é a autoridade de tudo (estado, permissão, limites, textos de motivo). Esta parte
A traz a fundação, a entrada com sessão e biometria, a tela da máquina, os alarmes e a conta. A parte B
começa pelo push de alarme no celular ([`app-push.md`](app-push.md)); OS, Coleta e "Modelos da IA" vêm em
seguida.

**Situação (22/11/2026):** compila, passa nos testes automáticos e monta o bundle Android de produção.
**Nada foi testado num celular**: tudo que depende do aparelho (Expo Go, biometria, haptics, fontes, tema,
teclado, gesto de segurar, eventos ao vivo pela rede) está no roteiro
[`app-teste-celular.md`](app-teste-celular.md), com as colunas de resultado vazias.

## O que o app faz, por papel

| Tela | OPERADOR | TECNICO | ADMIN |
|---|---|---|---|
| Entrar (e-mail e senha; digital ou rosto, se ligada) | sim | sim | sim |
| Máquina: placa de estado, rotação, uma linha por ponto, detalhe do ponto com a tendência do RMS (15 min, 1 h, 8 h, 24 h) | sim | sim | sim |
| Alarmes: lista ao vivo, detalhe, linha do tempo, segunda opinião | sim | sim | sim |
| Reconhecer alarme (segurando 1,5 s) | sim | sim | sim |
| Suprimir e cancelar supressão (motivo e prazo da API) | — | — | sim |
| OS: lista (abertas sem dono primeiro), detalhe com alarme de origem, tendência em volta da abertura e segunda opinião | sim | sim | sim |
| OS: assumir (toque com confirmação) e concluir (retorno, condição e observação, segurando) | — | sim | sim |
| Coleta: pré-voo, abrir ensaio, gravar, marcar evento, encerrar e descartar (segurando), cobertura | — | sim | sim |
| Conta → Modelos da IA: versões, métricas da validação e ativar (segurando) | — | — | sim |
| Conta: usuário, tema, fonte dos dados, biometria, notificações, versões, sair | sim | sim | sim |
| Notificação (push) de alarme novo | sim | sim | sim |
| Notificação (push) de OS aberta e de problema de sensor | — | sim | sim |

O mapa de quem pode o quê está em [`mobile/src/dominio/permissoes.ts`](../mobile/src/dominio/permissoes.ts),
copiado da `SegurancaConfig` da API, com teste. O app só esconde o que o papel não pode; a API continua
decidindo, e um 403 vira a mensagem "Seu papel não permite esta ação. A API recusou o pedido.", nunca uma tela
quebrada.

**Fonte dos dados.** Real (padrão a cada abertura) ou Simulado, em Conta. Real e simulado nunca se misturam:
toda consulta e o fluxo de eventos levam `simulado`. Com Simulado, uma faixa hachurada fica no topo de todas as
telas e cada ponto e alarme leva o selo SIM.

## Como funciona

| Parte | Onde | Como |
|---|---|---|
| Cliente da API | `src/api/cliente.ts`, `esquema.d.ts` | openapi-fetch tipado pelo esquema gerado de `painel/openapi.json` com o mesmo gerador do painel (`npm run api:tipos`; `npm run api:conferir` falha se o esquema não bate com o contrato). Token no cabeçalho, 401 encerra a sessão, 75 s de limite por chamada. |
| Sessão | `src/api/sessao.ts`, `autenticacao.ts` | Token JWT e a hora em que vence no SecureStore. Ao abrir: sem token, entrada; vencido, entrada com "Sua sessão expirou"; biometria ligada, tela de destravar; senão confere em `/auth/eu`. A sessão encerra sozinha na hora do vencimento. |
| Tendência do ponto | `dominio/tendencia.ts`, `componentes/GraficoTendencia.tsx`, `TendenciaDoPonto.tsx` | Regras do painel: 15 min e 1 h com as janelas normais (páginas de 200, o máximo da API), 8 h e 24 h com a série agregada (média do intervalo). Vão maior que 2,5 × o passo quebra a linha: buraco é buraco. Faixa normal sombreada e limites de atenção e alarme em linhas finas tracejadas, a partir do típico e do σ efetivo que a avaliação da API traz (`sigma_efetivo`) e dos limites em z; a legenda diz de que marcha e etapa é a referência. Cor só no desvio, pelo z da API (▲ atenção, ◆ alarme). Arrastar na horizontal mostra valor e hora; o arrasto vertical rola a tela; no leitor de tela, deslizar para cima e para baixo anda pelas amostras. Desenho em `react-native-svg` (já no Expo Go), sem biblioteca de gráfico nova. A linha é sempre contínua, como no painel depois da revisão de design: tracejado e pontilhado eram lidos como lacuna. O ponto aparece no título da tela. |
| Ordens de serviço | `dominio/ordens.ts`, `telas/TelaOrdens.tsx`, `TelaDetalheOrdem.tsx` | Lista da fonte em uso com filtro por status (a API filtra); abertas sem dono em destaque por borda e texto, sem cor (cor é só de alarme). Concluir manda o retorno (obrigatório), a condição encontrada e a observação (opcionais); as opções da condição e do retorno vêm de `src/api/enumeracoes.ts`, gerado de `painel/openapi.json` junto com o esquema (`npm run api:tipos`) e conferido por `npm run api:conferir`: o app não tem lista escrita à mão. O evento ao vivo de OS recarrega a lista e o detalhe; o toque na notificação de OS abre o detalhe. |
| Coleta | `dominio/coleta.ts`, `telas/TelaColeta.tsx` | O ensaio é da API: a tela pergunta se há ensaio aberto na máquina (a cada 10 s e ao voltar para o app) e mostra "gravando" ou "preparar". Preparar começa pela próxima gravação sugerida pela cobertura; etapa, condição e motivos de evento vêm de `enumeracoes.ts` (contrato), rotações e contagens da cobertura da API, materiais e ferramentas do catálogo. Regra do protocolo, igual à do painel: condição só no corte (T3) e T0 a 0 rpm. Pré-voo pela última janela viva: A, B e C chegando, FC-51 contando voltas (a rotação vem dele) e rotação a ±10 % do alvo; sem dado vivo bloqueia e o REC diz por quê, o resto só avisa com o que fazer. As linhas reaparecem em sequência a cada janela nova. REC é o único círculo grande, com haptics médio. Gravando: cronômetro em matriz de pontos a partir do início na API, janelas e saturadas do resumo da API, fita com as últimas 48 janelas (saturada alta e hachurada), marcar evento com a hora do primeiro toque, encerrar e descartar segurando. Ao encerrar, a célula da cobertura carimba "+1" com haptics leve. A API recusa um segundo ensaio aberto na máquina (409), e a mensagem dela aparece no aviso. |
| Modelos da IA | `dominio/modelos.ts`, `telas/TelaModelos.tsx` | Em Conta, só ADMIN (rotas `/conta/modelos`). Lista da máquina e do tipo de dado em uso: ativa primeiro, depois candidatas e arquivadas, com quem treinou e quem ativou. Detalhe: os avisos da API e, acima das métricas, o mesmo aviso do painel (a validação ainda vaza pela referência; recall e falso positivo otimistas; ativar só depois de medir memória no Render). Validação por ensaio e por dia com F1, recall por classe, matriz e a comparação regra × Isolation Forest; sem métricas, o motivo da API. Ativar: a frase de consequência (a versão ativa hoje vira arquivada; o modelo nunca muda estado, prioridade nem abertura de alerta) e segurar. O botão Treinar fica só no painel. |
| Push | `src/api/push.ts`, `dominio/notificacao.ts`, `hooks/useNotificacoes.ts` | `expo-notifications`, carregado só fora do Expo Go. Pedido depois do login com uma frase do porquê; canal Android `alarmes` antes da permissão; token do Expo registrado na API a cada sessão e removido ao sair, antes de apagar a sessão; toque abre o alarme (mesmo com a sessão travada, depois de destravar). Detalhes e passos manuais em [`app-push.md`](app-push.md). |
| Biometria | `src/api/biometria.ts` | `expo-local-authentication` só destrava o token guardado; senha nunca é guardada. No primeiro login com biometria cadastrada, pergunta uma vez "Usar digital/rosto para entrar?". Desliga em Conta. |
| Eventos ao vivo | `src/api/eventos.ts`, `hooks/useEventosAoVivo.ts` | A rota SSE do painel, lida pelo `fetch` do Expo (no celular, `expo/fetch` é o fetch global e lê a resposta em pedaços), com o token no cabeçalho, nunca na URL. Uma conexão para o app inteiro. Reconecta com 1, 2, 4, 8, 15 e 30 s (como o painel) e, enquanto isso, consulta a cada 5 s. App em segundo plano: fecha a conexão e para as consultas; ao voltar, reconecta e recarrega tudo. |
| Servidor que dorme | `src/api/saude.ts`, `dominio/conexao.ts` | Falha de rede com o celular conectado é "acordando o servidor, aguarde", com sondas em `/actuator/health` (2, 3, 5, 8, 10 e 15 s); a entrada tenta de novo sozinha. Depois de 150 s falhando, "sem conexão". Sem rede no aparelho (expo-network), "sem conexão" na hora. |
| Estado da tela | `src/dominio/` | Regras puras de exibição: formatação pt-BR (feita à mão, sem `Intl`, para ser igual no iPhone e no Android), estado → texto + forma + cor, dado velho, régua em z, ordem dos alarmes, permissões, endereço da API. |
| Tema | `src/tema/`, `scripts/gerar-tema.mjs` | Gerado do `painel/src/index.css` (mesmos nomes semânticos), OKLCH convertido para hex. `npm run tema:conferir` falha se o painel mudou e o app não foi regenerado. |
| Estilo | Uniwind (Tailwind v4 para React Native) | `className` com os tokens; "light" = claro cinza ISA, "dark" = escuro grafite. |

## Normas e boas práticas seguidas

| Norma | Onde no app |
|---|---|
| **ISA-101** (HMI de alto desempenho) | Cinza é o normal; âmbar e vermelho só para atenção e alarme. Todo estado em texto + forma + cor (`dominio/estado.ts`, `dominio/alarme.ts`): círculo normal, triângulo atenção, losango alarme, quadrado instrumento, anel sem dados; tracejado quando não é avaliação (sem referência, dado velho). Pontos A, B e C em três cinzas e três estilos de linha (contínua, tracejada, pontilhada) com a letra. |
| **ISA-18.2** (gestão de alarmes) | Estados ativo não reconhecido, ativo reconhecido, normalizado não reconhecido, suprimido e encerrado, com prioridade, vindos da API. Reconhecer é ato deliberado: segurar 1,5 s. Suprimir exige motivo e prazo, só ADMIN. O app nunca cria, apaga ou muda prioridade. Ordem da lista: em aberto, prioridade alta, não reconhecido, mais novo. |
| **OWASP MASVS** (no que cabe) | Token só no Keychain/Keystore (SecureStore), nunca em AsyncStorage nem em log. Senha nunca guardada. Fora do desenvolvimento só https (`dominio/endereco.ts` recusa http fora de `__DEV__` e fora da rede local). Nenhum segredo no bundle: só o endereço da API, que é público. Sair apaga o token, a preferência de biometria e o cache das consultas. |
| **WCAG 2.2 AA** adaptado | Contraste 4,5:1 ou mais de todo texto sobre todas as superfícies, nos dois temas, conferido por teste (`tema/tema.test.ts`). Rótulo de acessibilidade em todo controle; estados ditos em texto. "Reduzir movimento": o ícone que pisca vira anel parado; as animações de toque ficam instantâneas. Fonte do sistema respeitada até 130% (`maxFontSizeMultiplier`). |
| **Ergonomia de chão de fábrica** | Alvo de toque de 56 dp ou mais (botões, filtros, voltar, prazos). Nada depende de gesto fino. Ação perigosa nunca num toque só (reconhecer e suprimir são segurar). |
| **LGPD** | O aparelho guarda só o token com a hora de vencimento, o e-mail para preencher a entrada, o tema e se a biometria está ligada. A fonte dos dados fica só em memória. |

Sem conexão, as ações que escrevem na API ficam desligadas e nada é guardado para enviar depois: em alarme,
ação atrasada engana.

## Design

Mesma linguagem do painel ([`painel.md`, Direção visual](painel.md#direção-visual)), com as diferenças pedidas
para o celular: o tema claro "cinza ISA" é o padrão (luz forte da oficina), o escuro "grafite" segue o sistema
ou a escolha em Conta. Módulos separados por linhas de 1 px, sem cartão com sombra. Rótulos curtos em
caixa-alta; valores em IBM Plex Mono com algarismos tabulares e unidade menor em cinza. Matriz de pontos (Doto)
só na placa de estado da máquina e na rotação viva; com dado velho, a rotação sai em Plex Mono cinza claro.

Movimento: valores medidos trocam seco. Toque em botão: escala 0,97 em 100 ms, volta em 150 ms. Segurar para
confirmar: anel de 24 tiques enche em 1,5 s linear, com haptics de seleção a cada 250 ms e de sucesso no fim;
soltar antes volta em 200 ms. O fim é contado por um temporizador comum, não pelo fim da animação, e nada muda
o estado do React durante o gesto. Alarme novo pelo SSE: aviso curto no topo (entra em 220 ms, sai em 150 ms) e
haptics de aviso, sem som. Troca de aba sem animação (abas nativas).

**Galeria de estados** (só em desenvolvimento: Conta → "Galeria de estados"): cada componente em cada estado
(normal, atenção, alarme, sem referência, calibração diferente, não avaliável, velho, sem dados, simulado,
instrumento, texto longo, valor máximo de ±16 g), com botão para trocar de tema. A CI confere que a galeria e os
exemplos de teste ficam fora do bundle de produção (`scripts/conferir-bundle.mjs`).

## Como rodar

Pré-requisitos: Node 24 no notebook; no celular, o **Expo Go** da App Store ou da Play Store, que abre a
**SDK 58** (a do projeto). Notebook e celular na mesma rede Wi-Fi.

```powershell
cd mobile
npm ci
copy .env.example .env      # e preencha EXPO_PUBLIC_API_URL (veja abaixo)
npx expo start              # mostra o QR code
```

No iPhone, leia o QR code com a câmera; no Android, com o próprio Expo Go.

**Qual API usar (`EXPO_PUBLIC_API_URL`):**

- **API local do docker compose:** `http://<IP do notebook na rede>:8080` (veja o IP com `ipconfig`, em
  "Endereço IPv4" do Wi-Fi). O compose publica a porta 8080 em todas as interfaces; o Firewall do Windows pode
  pedir para liberar. Em desenvolvimento o app aceita http só para IP de rede local. Para ver dado, rode o
  simulador (`python analise/simulador.py continuo --modo severo`) e escolha Simulado em Conta.
- **Se o celular recusar http** (o Android bloqueia texto claro em app compilado; o Expo Go permite, mas isso
  **não foi conferido**): use a API do Render, com https. Ela dorme no plano gratuito: a primeira chamada pode
  levar cerca de 1 minuto, e o app mostra "acordando o servidor, aguarde" e tenta de novo sozinho.

Depois de mudar o `.env`, pare e rode `npx expo start` de novo (as variáveis `EXPO_PUBLIC_` entram na montagem).

**Comandos:**

```powershell
npm run typecheck        # TypeScript estrito
npm run lint             # ESLint sem avisos
npm test                 # Jest
npm run test:cobertura   # Jest com a meta de 85% de linhas em src/dominio e src/api
npm run api:tipos        # regenera src/api/esquema.d.ts e src/api/enumeracoes.ts de painel/openapi.json
npm run api:conferir     # falha se o esquema ou as enumerações não batem com o contrato
npm run tema             # regenera src/tema a partir de painel/src/index.css
npm run fumaca           # com o compose e o simulador no ar: entra, lê máquina e alarmes, reconhece um simulado
```

## Medições desta parte (22/11/2026, no notebook, Windows 11, Node 24.14)

- Jest: **92 testes, nenhuma falha** (`npm run test:cobertura`). Cobertura de linhas: `src/dominio` **100 %**,
  `src/api` **96,63 %** (meta 85 %).
- Contraste calculado (fórmula WCAG sobre os hex gerados): todo texto (`texto`, `apoio`, `fraco`, textos de
  atenção, alarme e informação) passa de 4,5:1 sobre fundo, módulo e rebaixo nos dois temas.
- `npx expo-doctor`: 20/20 verificações.
- `npx expo export --platform android`: bundle montado sem `EXPO_PUBLIC_API_URL` (4,9 MB em bytecode Hermes;
  3,3 MB em JavaScript com `--no-bytecode`), sem a galeria.
- Fumaça (`node scripts/fumaca.mjs`) contra a API local do compose com o simulador em modo severo: entrou,
  leu a máquina, a última janela simulada (3 s de idade) e 9 alarmes simulados, e reconheceu um (ativo não
  reconhecido → ativo reconhecido). Dado simulado: prova o encadeamento, não a detecção real.

## O que o Expo Go não tem

Conferido na documentação do Expo para a SDK 58 (23/11/2026):

- **Push remoto: em nenhum sistema.** "In SDK 53 and later, Expo Go does not support push notifications
  functionality" (FAQ de notificações do Expo). No Expo Go, a Conta mostra "Notificações indisponíveis neste
  modo." e o resto do app funciona igual. Notificação local funcionaria, mas o app não usa.
- **Android:** push só no APK do perfil `preview` (EAS Build com Firebase e credencial FCM V1), seguindo
  [`app-push.md`](app-push.md).
- **iPhone:** push só num build próprio, que exige a conta paga do Apple Developer Program; fora deste projeto.
  No Expo Go do iPhone também não há Face ID (ver "Limitações").

## O que fica fora do app e por quê

Usuários, catálogos de material e ferramenta, exportar CSV, mapa de ordens, replay de ensaio, referência e
diagnóstico da regra: trabalho de mesa, com tela grande, no painel. O app é para quem está ao lado do torno:
ver o estado agora e responder a um alarme.

## Limitações conhecidas

- **Nada testado em celular** (ver o roteiro). Compilar o bundle não é testar no aparelho.
- **Face ID no Expo Go do iPhone não funciona** (o Expo Go não declara a permissão); o sistema cai na senha do
  aparelho. A digital no Android funciona no Expo Go. O Face ID de verdade só num build próprio (parte B).
- No iOS 26, as abas nativas usam o vidro do sistema ("Liquid Glass"); o app não tem como desligar isso no
  Expo Go.
- O mock oficial do Reanimated 4.7.1 não carrega no jest-expo; os testes usam uma simulação mínima
  (`src/testes/reanimadoSimulado.tsx`). A lógica de segurar para confirmar é testada (temporizador), a animação
  não.
- A API não publica a própria versão; Conta mostra só se o `/actuator/health` responde UP.
- O detalhe da OS ligada a um alarme mostra só o número (a tela de OS é da parte B).
