# Painel web (centro de controle)

O painel é a interface web de leitura do PredictSpin: mostra as máquinas, os pontos de medição e as
janelas de vibração que chegam à API, ao vivo. Esta é a Parte A (leitura e modo AO VIVO). A Parte B
(coleta de ensaios, replay, diagnóstico e alarmes) parte do que está descrito no fim deste documento.

- Código: [`painel/`](../painel)
- Contrato: [`painel/openapi.json`](../painel/openapi.json), exportado da API
- Evidências (prints finais): [`docs/evidencias/painel/`](evidencias/painel)

## Como rodar

Requisitos: Node 24, Docker Desktop ligado e o `.env` da raiz preenchido (veja o
[README](../README.md#como-rodar)). Tudo é local.

```powershell
# 1. API e banco
docker compose up -d --build

# 2. Janelas simuladas (dados marcados como simulados; Ctrl+C para parar)
python analise/simulador.py continuo --url http://localhost:8080

# 3. Painel
cd painel
npm ci
npm run dev          # http://localhost:5173
```

Entre com o administrador do `.env` (`ADMIN_EMAIL` e `ADMIN_SENHA`). A fonte dos dados começa em
**Real**; como nenhum dispositivo real envia ao compose, a tela diz isso e oferece **Ver dados
simulados**.

O endereço da API vem de `VITE_API_URL` (veja [`painel/.env.example`](../painel/.env.example)); sem
ele, o painel usa `http://localhost:8080`. A API precisa liberar a origem do painel em
`CORS_ORIGENS` (o padrão já inclui `http://localhost:5173`).

| Comando (em `painel/`) | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento na porta 5173 (inclui a galeria em `/galeria.html`) |
| `npm run build` | tipos e build de produção em `dist/` (a galeria fica de fora) |
| `npm run lint` / `npm run typecheck` | ESLint sem avisos e TypeScript estrito |
| `npm test` | Vitest (domínio, componentes de instrumento e a prova de que a galeria não entra no build) |
| `npm run test:e2e` | Playwright contra o compose local; os testes ligam o próprio simulador |
| `npm run api:gerar` | exporta o contrato da API local e regera os tipos do cliente |
| `npm run api:conferir` | falha se o `openapi.json` versionado difere do que a API local publica |

Os testes de ponta a ponta leem as credenciais do `.env` da raiz e **ignoram** variáveis de ambiente
do computador (que podem apontar para a API publicada). O simulador que eles ligam roda sempre com
`--url http://localhost:8080`.

## Estrutura de pastas

```
painel
├── e2e/                    Playwright: login, papéis, leitura, AO VIVO, eventos, acessibilidade, piores casos
│   └── apoio/              ambiente local, sessão e o simulador ligado pelos testes
├── scripts/                exportar o contrato, lançador do Vitest, teste "galeria fora do build"
├── src/
│   ├── api/                cliente gerado (esquema.d.ts), sessão, saúde, eventos (SSE), consultas
│   ├── dominio/            regras puras e testadas: formatação pt-BR, idade e limiares, estado,
│   │                       escalas do mapa, lacunas, leitor de eventos, modo rápido, tacômetro
│   ├── estado/             preferências (tema, fonte), relógio, transporte (eventos/consulta)
│   ├── hooks/              máquina ao vivo, modo rápido, frescor, página visível
│   ├── componentes/
│   │   ├── ui/             base shadcn (Base UI) restilizada: botão, campo, alternador, dica, tabela
│   │   ├── instrumento/    Leitura, Tacometro, EsquemaTorno, MapaOrdens, GraficoTendencia,
│   │   │                   Sparkline, ReguaDesvio, Selos, MarcadorPonto, Idade, Estados...
│   │   └── casca/          barra superior
│   ├── rotas/              rotas por arquivo (TanStack Router)
│   ├── telas/              login, visão geral (L1), máquina (L2), ponto (L3), coleta, apoio
│   ├── galeria/            galeria de componentes (só desenvolvimento)
│   └── index.css           tokens e utilidades (Tailwind 4, CSS-first)
├── galeria.html            entrada da galeria (só no servidor de desenvolvimento)
└── openapi.json            contrato da API, versionado
```

Rotas do painel:

| Rota | Tela | Quem abre |
|---|---|---|
| `/login` | entrada (aceita `?voltar=` para retornar à tela pedida) | todos |
| `/` | L1, visão geral: uma linha por máquina | ADMIN, TECNICO, OPERADOR |
| `/maquinas/:id` | L2, máquina: tacômetro, esquema, pontos, mapa de ordens (`?mapa=30min\|2h\|8h`) | ADMIN, TECNICO, OPERADOR |
| `/maquinas/:id/pontos/:codigo` | L3, ponto: leituras, tendência, AO VIVO, janelas (`?periodo=&de=&ate=&quadro=&pagina=`) | ADMIN, TECNICO, OPERADOR |
| `/coleta` | reservada à Parte B (hoje diz que ainda não existe) | ADMIN, TECNICO |

## Decisões

| Decisão | Por quê |
|---|---|
| Vite + React 19 + TypeScript estrito (`noUncheckedIndexedAccess`) | SPA estática, publicável como site estático; nada de servidor próprio. |
| TypeScript 5.9 e ESLint 9 (não as versões mais novas) | `typescript-eslint` e plugins de React ainda não aceitavam TS 6 e ESLint 10 sem conflito de dependências. |
| Cliente gerado do contrato (openapi-typescript + openapi-fetch) | Os tipos do painel vêm do documento OpenAPI que a API publica; um teste da API compara o `openapi.json` versionado com o publicado, então contrato e painel não se separam em silêncio. |
| TanStack Query e TanStack Router | Cache, novas tentativas e invalidação das consultas; rotas por arquivo com busca validada (Zod) e divisão de código por rota. |
| Sessão em memória e em `sessionStorage`, com `Authorization: Bearer` | A API e o painel ficam em domínios diferentes no Render; um cookie de sessão entre domínios exigiria `SameSite=None`, proteção contra CSRF e mudança na API. O token some ao fechar a aba e é conferido em `/auth/eu` ao abrir; 401 encerra a sessão com aviso. |
| SSE lido com `fetch` (não `EventSource`) | `EventSource` não envia o cabeçalho `Authorization`. O leitor (`api/eventos.ts`) trata linhas, comentários de batimento, `retry` e reconexão. |
| uPlot para séries; canvas e SVG próprios para mapa, tacômetro e esquema | Milhares de pontos com custo baixo; o resto é desenho específico de instrumento. |
| Dados simulados sempre marcados | Faixa hachurada no topo, selo SIM em cada módulo e hachura no mapa: impossível confundir com medição num print. |
| Fonte Real por padrão | O painel nunca começa mostrando dado simulado como se fosse o normal. |
| Idade do dado pelo relógio monotônico | `performance.now()` não anda para trás nem salta com ajuste do relógio do computador. |
| Sparklines e séries contínuas | Linha interrompida quer dizer lacuna (sem janela). Tracejado e pontilhado se confundiam com lacuna (o ajuste de direção apontou isso no ponto C). O estilo de linha por ponto (item 4 da direção) fica para um gráfico que compare pontos; hoje cada gráfico mostra um ponto só. |
| Escala do mapa do mínimo ao máximo de cada linha | Do zero ao máximo, um sinal estável deixava todas as células no topo da rampa (quase brancas). |
| Rotação sem separador de milhar ("1180") | Pedido do ajuste; a fonte de matriz de pontos lê como mostrador. |
| `ultimo_contato` combinado com a última janela | A API grava o contato com resolução de 10 s (para não travar a linha do dispositivo a cada janela); a janela recebida é um contato mais recente. |
| Lançador próprio do Vitest (`scripts/vitest.mjs`) | No Windows, `c:` e `C:` na pasta de trabalho carregavam o Vitest duas vezes ("failed to find the current suite"); o lançador normaliza a letra da unidade. |
| Erros de formulário e de pedido sem vermelho | Vermelho e âmbar são só desvio e alarme da máquina (ISA-101). Campo inválido, senha errada ou falha ao ligar o AO VIVO aparecem com ícone, borda tracejada e texto. |
| Troca de tela pelo roteador (`document.startViewTransition`) | O `<ViewTransition>` do React só anima atualizações dentro de transição, e a navegação do roteador é síncrona: medido no navegador, ele nunca disparava. O roteador anima só quando o caminho muda (período, página e mapa trocam seco). |
| Galeria fora do build | Exemplos com dados inventados só existem em testes e na galeria; um teste roda o build de produção e procura a marca da galeria. |

## Direção visual

O painel é um HMI de alto desempenho (norma ISA-101) com linguagem de instrumento de medição de
bancada (analisador de vibração, osciloscópio). Não é um SaaS genérico nem ficção científica.

1. Cinza é o estado normal. Fundo, estrutura, rótulos e valores em faixa ficam em tons neutros. Cor
   só aparece quando algo pede atenção. Uma tela saudável é quase toda cinza.
2. Âmbar e vermelho são reservados a desvio e alarme. Nunca decoração, nunca cor de marca, nunca
   gráfico "bonito". Não existe cor de marca: a ação principal é preenchida em grafite.
3. Todo estado aparece em pelo menos 2 de 3 canais: cor, forma e texto.
4. Pontos A, B, C: três tons neutros discretos E três estilos de linha (A contínua, B tracejada,
   C pontilhada), com a letra no fim da linha. Nenhum deles vermelho, âmbar ou amarelo.
5. Dado simulado: hachura diagonal + selo "SIM", sempre. Impossível confundir com medição num print.
6. Dado velho: valores em cinza claro com o texto "sem dados há X". Valor velho nunca parece valor vivo.
7. Estrutura visível: módulos separados por linhas de 1 px, cantos retos ou raio de 2 px. Nada de
   cartão flutuando com sombra, cartão dentro de cartão ou grade de cartões iguais.
8. Rótulos curtos em caixa-alta pequena com espaçamento (RMS, PICO, CURT, 1X, 2X, 3X, RPM); valor
   embaixo.
9. Tipografia: IBM Plex Sans (interface) e IBM Plex Mono (só valores numéricos, letras A/B/C e
   códigos). Números com tabular-nums. Escala 12 / 13 / 15 / 18 / 24 / 32. Fonte de matriz de pontos
   SÓ em três lugares: rotação na tela da máquina, placa de estado na visão geral e cronômetro de
   gravação (parte B); nunca abaixo de 24 px, nunca em texto corrido ou tabela.
10. Gráficos com retícula de osciloscópio ao fundo (grade 10×8 em cinza muito claro, com subdivisões).
11. Botão com espessura: 1 px de luz em cima e 1 px de sombra embaixo (inset), que se invertem ao
    pressionar, com scale(0.97). Plano com espessura, não skeumorfismo.
12. Temas: claro "cinza ISA" e escuro "grafite" (neutro, não azul-marinho, sem brilho). Nunca #000
    nem #FFF puros.
13. Tokens em OKLCH no @theme do Tailwind, em duas camadas: primitivos (cinzas, âmbar, vermelho) e
    semânticos (superfícies, linha, texto, estado normal/atenção/alarme/info, ponto A/B/C,
    simulado). Componentes só usam os semânticos. Tema por atributo data-theme; estados por atributo
    de dado (data-estado, data-velho, data-simulado). Use @container nos módulos.
14. Movimento: só transform e opacity; nunca transition: all; nunca ease-in; sem quique.
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1). Clique 100–160 ms; interface abaixo de 300 ms; saída
    mais rápida que entrada. Valores medidos que chegam da API NÃO animam (troca seca). Gráfico ao vivo
    desliza linear. Hover só com (hover: hover) and (pointer: fine). prefers-reduced-motion tira
    deslocamento.
15. Densidade alta, ruído baixo: números grandes só onde a decisão acontece.

**Não fazer:** fontes Inter, Roboto, Arial ou do sistema; gradiente roxo/azul; neon; texto com
gradiente; glassmorfismo; "métrica herói" (número gigante com gradiente); ícone grande arredondado
sobre cada título; borda grossa colorida de um lado só; sombras genéricas; sparkline decorativa sem
dado; todo botão como primário; modal por padrão; tudo centralizado; número contando a cada
atualização; título seguido de parágrafo que o repete; emoji. Teste final de cada tela: alguém diria
na hora "isso foi gerado automaticamente"? Se sim, refaça.

### Ajuste de direção (vale por cima dos itens acima onde divergem)

- **Tema grafite é o padrão**; o claro continua e a escolha fica salva no navegador.
- **Uma cor de sinal**, ciano de osciloscópio (matiz perto de 200 no OKLCH), com função e nunca de
  estado. Usos permitidos, e só estes: traço do dado ao vivo (último trecho das sparklines, traço do
  gráfico AO VIVO), foco e seleção, item sob o cursor, botão e faixa AO VIVO, pulso de chegada de
  janela.
- Hachura de simulado só na faixa do topo, nos selos SIM e no mapa.
- Contraste: texto AA (4,5:1), gráficos e bordas 3:1, nos dois temas.
- Rotação é o herói da L2: tacômetro em SVG com as 18 rotações nominais em escala logarítmica, a marca
  mais próxima na cor de sinal, número em Doto (cerca de 72 px) sem separador de milhar, "RPM" e
  "marcha mais próxima" embaixo.
- RMS do ponto com cerca de 40 px; unidade com cerca de 70 % do tamanho do valor.
- Movimento só com significado: anel na cor de sinal no marcador a cada janela (600 ms); barra que
  esvazia até o limite de dado velho (15 s, ou 4 s no modo rápido); traço de 1 px sob a leitura que
  mudou (some em 400 ms); trecho novo da sparkline e coluna nova do mapa entrando pela direita; faixa
  AO VIVO pulsando a cada 1 s; troca de tela L1, L2, L3 com transição de 200 a 250 ms. Com
  prefers-reduced-motion, tudo é troca instantânea.
- Botões com espessura em todos os lugares; esquema do torno com peças preenchidas, barra de RMS ao
  lado de cada marcador e rotação em texto no R; mapa com fundo do módulo, área "sem dado" antes da
  primeira janela, "aquecendo: X min de 30" e rampa de 8 degraus.
- Âmbar e vermelho continuam fora das telas enquanto não houver referência aprendida (só na galeria).

## Tokens

Definidos em [`painel/src/index.css`](../painel/src/index.css), em OKLCH, em duas camadas.

**Primitivos** (`@theme`): cinzas neutros `--cinza-NNN` (o número é a luminosidade × 1000), âmbar
(`--ambar-820/800/400`), vermelho (`--vermelho-720/620/530/450`), ciano de sinal (`--ciano-820`,
`--ciano-420`) e ardósia para informação (`--ardosia-750/420`). Tipografia: `--font-sans` (IBM Plex
Sans), `--font-mono` (IBM Plex Mono), `--font-matriz` (Doto 900). Escala `--text-12/13/15/18/24/32`, com
duas exceções só onde a decisão acontece: `--text-40` (RMS do ponto) e `--text-72` (rotação). Raios
`--radius-0` e `--radius-2`; `--ease-out` e `--ease-in-out`. As escalas padrão do Tailwind (cores,
sombras, raios, fontes) são zeradas para que nada fora dos tokens seja usado por engano.

**Semânticos** (por tema, `data-theme="grafite"` ou `"claro"`):

| Token | Papel | Grafite | Claro |
|---|---|---|---|
| `--superficie-fundo` | fundo da página | cinza 0,20 | cinza 0,86 |
| `--superficie-modulo` | módulos | cinza 0,245 | cinza 0,905 |
| `--superficie-rebaixo` | campos, mapa, placas | cinza 0,175 | cinza 0,88 |
| `--superficie-realce` | peças do esquema, seleção neutra | cinza 0,30 | cinza 0,82 |
| `--linha` / `--linha-forte` | divisórias de 1 px / bordas de controle | 0,36 / 0,58 | 0,72 / 0,50 |
| `--texto` / `--texto-apoio` / `--texto-fraco` | valor e título / rótulo / dado velho | 0,905 / 0,74 / 0,66 | 0,24 / 0,40 / 0,46 |
| `--acao`, `--acao-texto` | ação principal (preenchida em grafite) | cinza 0,86 sobre 0,20 | cinza 0,30 sobre 0,97 |
| `--estado-atencao`, `--estado-alarme` (+ `-sobre`, `-texto`) | desvio e alarme | âmbar 0,80 / vermelho 0,62 | âmbar 0,80 / vermelho 0,53 |
| `--estado-info` | informação | ardósia 0,75 | ardósia 0,42 |
| `--ponto-a/b/c` | tons dos pontos | 0,925 / 0,74 / 0,58 | 0,25 / 0,42 / 0,56 |
| `--sinal`, `--sinal-suave` | cor de sinal (usos acima) | ciano `oklch(0.82 0.12 200)` | ciano `oklch(0.42 0.07 205)` |
| `--foco` | anel de foco | `--sinal` | `--sinal` |
| `--simulado` | hachura de dado simulado | cinza translúcido | cinza translúcido |
| `--reticula`, `--reticula-fina` | retícula de osciloscópio | — | — |
| `--relevo-*` | 1 px de luz e de sombra dos botões | — | — |

Contraste medido (axe e cálculo próprio): a cor de sinal tem 8,17:1 ou mais sobre todas as superfícies
do grafite e 4,7:1 ou mais no claro; `--linha-forte` sobre o módulo tem 3,79:1 (grafite) e 4,52:1
(claro).

Utilidades próprias: `valor` (Plex Mono com `tabular-nums`), `rotulo` (caixa-alta pequena com
espaçamento), `matriz` (Doto), `hachura` (simulado), `relevo` e `relevo-acao` (espessura dos botões).
Estados por atributo: `data-estado`, `data-velho`, `data-simulado`, `data-frescor`, `data-conexao`,
`data-transporte`.

## Cliente da API

O contrato é o documento OpenAPI 3.1 que a própria API publica em `/v3/api-docs` (springdoc). Ele diz
o que é obrigatório e o que pode ser nulo, e os nomes seguem o JSON real (snake_case).

```powershell
docker compose up -d       # a API local precisa estar no ar
cd painel
npm run api:gerar          # exporta painel/openapi.json e regera src/api/esquema.d.ts
npm run api:conferir       # só confere (falha se o versionado difere do publicado)
```

O script de exportação só aceita `localhost`, ordena as chaves (diff estável) e remove `servers`. Do
lado da API, `ContratoDoPainelIntegracaoTest` compara o `openapi.json` versionado com o publicado: se
alguém muda a API sem regenerar o contrato, o build da API falha.

No código, `src/api/cliente.ts` cria o cliente (`openapi-fetch`) com dois intermediários: o que põe o
token e trata o 401 (encerra a sessão com aviso) e o que informa a saúde da conexão a cada chamada.
`exigir()` transforma resposta de erro em `ErroApi` (com `ErroResposta` e `Retry-After`) e falha de
rede em `ErroRede`. As consultas ficam em `src/api/consultas.ts` como `queryOptions`.

## Eventos e AO VIVO

**Eventos (SSE).** Na L2 e na L3, o painel abre `GET /api/v1/maquinas/{id}/eventos` com `fetch` e o
token. Cada janela gravada chega como evento `janela`; mudanças do modo rápido chegam como
`modo_rapido` e mudanças de ensaio como `ensaio` (este só para ADMIN e TECNICO); comentários
`:batimento` a cada 15 s mantêm a conexão. A janela nova entra direto no cache das
consultas, sem nova requisição. Limites da API: 4 conexões por usuário (429) e 20 no total (503), com
`Retry-After`; a conexão é encerrada pelo servidor depois de 30 min e o painel reconecta. A arquitetura
do lado da API está em [`docs/arquitetura.md`](arquitetura.md).

**Queda e volta.** Se os eventos caem, o painel reconecta com espera crescente (1, 2, 4, 8, 15 e 30 s)
e, enquanto isso, consulta a última janela a cada 5 s. A barra superior diz qual dos dois está em uso
("eventos ao vivo" ou "consulta a cada 5 s"). Com a aba em segundo plano, nada é consumido.

**Saúde da API.** Falha de rede com o navegador conectado aparece como "API acordando" (a instância do
Render dorme e leva cerca de 1 minuto para voltar), com sondas em `/actuator/health` a 2, 3, 5, 8, 10 e
15 s; depois de 150 s falhando, vira "Sem conexão". Quando a API volta, as consultas são refeitas.

**Dado velho.** A idade da última janela é contada pelo relógio monotônico. Passa a velha depois de
15 s sem janela, ou 4 s quando o modo rápido está ligado e a última janela foi rápida. Velho: valores
em cinza claro, marca "sem dados há X" e a barra do topo vazia.

**AO VIVO (modo rápido).** Na L3, "AO VIVO" chama `POST /maquinas/{id}/modo-rapido`: a API pede ao
dispositivo janelas de 1 s por 2 minutos. O painel renova o prazo nos últimos 30 s enquanto a tela
estiver aberta e desliga (`DELETE`, também com `keepalive` ao fechar a aba) ao sair. As janelas
rápidas aparecem no quadro "últimos 60 s", com marca na base do gráfico, e não entram na tendência
histórica. Qualquer usuário autenticado pode ligar o modo (a API não restringe por papel).

## Revisão

Sete rodadas completas, com a direção visual e o ajuste como critério; a regra era parar só quando
uma rodada inteira não achasse defeito de direção. A primeira foi feita por quem construiu; da segunda
em diante, cada rodada foi de um revisor que não participou da construção e recebeu só as prints, a
direção, o ajuste e a lista "não fazer" (um revisor novo a cada rodada, exceto a segunda, retomada
depois de uma interrupção). Cada rodada: prints de todas
as telas (login, L1, L2, L3, L3 AO VIVO e galeria; 1920×1080 e 390×844; grafite e claro; vivo, velho,
simulado e Real vazio), um detector automático de antipadrões de interface (rodado com `npx`, fora das
dependências do projeto) em cada tela, as regras de web-design-guidelines, uma
revisão de movimento medida no navegador e os piores casos de break-ui.

### Rodada 1 (feita por quem construiu)

Achados e correções:

| Achado | Onde | Correção |
|---|---|---|
| Visita sem sessão a uma rota protegida travava a aba (o `<Navigate>` da casca se repetia sem fim enquanto o login carregava) | todas as rotas protegidas | um efeito navega uma vez; teste de ponta a ponta novo |
| Traço do AO VIVO e séries da tendência tracejados, lidos como lacuna | L3 | séries contínuas, separadas por tom, espessura e rótulo no fim da linha |
| Leituras do cabeçalho do ponto cortadas ("0… g") | L3 em 390 px | duas ou três colunas no estreito |
| Horas do eixo de tempo sobrepostas | L3 AO VIVO em 390 px | menos marcas conforme a largura |
| Barra superior em quatro linhas | todas em 390 px | relógio, nome e detalhe do transporte saem no celular; barra rola com a página |
| Identificador de dispositivo escrito no código da faixa de simulado | faixa do topo | texto genérico |
| Conteúdo a 12 px da borda | todas | margem lateral de 16 px |
| Barra fixa podia cobrir o elemento em foco | todas | `scroll-padding-top` |
| Placa de estado em matriz de pontos na L2 (item 9 só permite na L1) | L2 | placa em Plex Mono na L2 |
| Troca de tela não animava (o `<ViewTransition>` do React não dispara em navegação síncrona) | L1, L2, L3 | o roteador chama `document.startViewTransition` só quando o caminho muda; o módulo do ponto vira o cabeçalho da L3 |
| break-ui, código do ponto com 10 caracteres vazava do marcador e era cortado no mapa | L2 | marcador mostra a primeira letra (nome na dica); coluna de rótulos do tamanho do maior |
| break-ui, ponto com código diferente de A, B, C sumia do esquema | L2 | posição pelo papel do ponto |
| break-ui, valores no limite do contrato (1000 g) cortados e eixo Y cortando "1.000,000" | L3 | colunas e eixo pela largura do rótulo |
| break-ui, 5 dígitos de rotação (até 30000 rpm) sobre o arco | L2 | número no degrau 40 da escala |
| break-ui, gráfico sem nenhum valor com escala inventada | L3 | "Nenhum valor no período." e eixo sem números |
| break-ui, código de máquina de 40 caracteres cortado no título da L2 | L2 | título quebra a linha |
| break-ui, mais de 200 máquinas (máximo por consulta) sem aviso | L1 | "mostrando as primeiras N" |

Ferramentas:

- Detector de antipadrões (versão 4.9.1, com a telemetria desligada): login e coleta sem achados. L1, L2, L3 e a
  galeria acusaram `cramped-padding` em selos compactos (16 a 24 px de altura, texto em caixa-alta
  centralizado), aceito por ser o desenho do selo. Na galeria, também `flat-type-hierarchy` (h1 de
  18 px), aceito porque a hierarquia do instrumento está nos valores (40 e 72 px), e
  `body-text-viewport-edge`, corrigido com a margem de 16 px. O aviso `repeating-stripes-gradient` é
  a hachura de simulado pedida pela direção. As telas autenticadas foram analisadas pelo `--cdp`, com
  um navegador local já logado.
- web-design-guidelines: buscas por `...`, `transition: all`, `outline-none` sem substituto, clique em
  `div`, `autoFocus`, campos sem rótulo, zoom bloqueado, `color-scheme`, `tabular-nums` e
  `touch-action` voltaram limpas; os dois achados (foco sob a barra fixa e margem) estão na tabela.
- Movimento (o roteiro review-animations não estava disponível nesta máquina; a revisão foi medida no
  navegador): só
  `transform` e `opacity` animam; anel de 600 ms, traço de mudança de 400 ms, trecho novo de 200 ms;
  com `prefers-reduced-motion`, nenhuma animação roda e a troca de tela é instantânea.
- break-ui: os piores casos entraram pela fronteira dos dados (respostas da API trocadas no caminho
  pelo Playwright), nos limites do banco e do contrato. Zero e 50 máquinas, valor nulo e janela sem um
  ponto já se comportavam bem. API fora do ar foi testada parando o contêiner: "API acordando", dado
  velho marcado e volta sozinha ("API ok" 17 s depois de a API subir). Os piores casos viraram o teste
  `e2e/piores-casos.spec.ts`.

### Rodada 2 (revisor independente)

Feita por um revisor que não participou da construção e recebeu só as 44 prints, a direção, o ajuste
e a lista "não fazer". Veredito: **1 grave, 6 médios, 11 leves**. Todos foram tratados:

| Gravidade | Achado | Correção |
|---|---|---|
| grave | Esquema do torno não marcava dado velho: leitura de rotação no contraste de vivo, barras com borda ciano, módulo sem "sem dados há X" | esquema recebe o estado velho (cinza, sem cor de sinal) e o módulo ganha a marca |
| médio | Barra de frescor do topo sempre vazia nas prints | efeito da captura (`animations: 'disabled'` adianta a animação de 15 s até o fim); a captura passou a deixar as animações rodarem; com movimento reduzido a barra fica cheia e parada até o dado envelhecer |
| médio | Sparkline da L1 com o trecho final solto | lacuna real (simulador parado entre os testes); legenda de lacuna nas telas e trecho ao vivo explicado |
| médio | Rótulos do tacômetro se atropelando e cruzando traços | texto ancorado pelo ângulo, fora do traço; rótulos próximos numa segunda fileira, por fora |
| médio | Rótulos no fim das linhas riscados pelo traço | rótulos na margem direita, fora da área do gráfico, sem se encostarem |
| médio | Contagens que não batiam ("67 janelas no período" e "1–15 de 78") | cada uma diz o que conta: "janelas normais no gráfico" e "janelas (normais e rápidas)" |
| médio | Lacuna do mapa igual ao fundo, sem o símbolo da legenda | contorno tracejado em cada trecho sem janela |
| leve | Espaços irregulares em "há 5 s" | só o número em fonte de valor, espaço fino antes da unidade |
| leve | "— g" (unidade sem valor) | valor vazio só com o traço |
| leve | Módulos de ponto vazios sem marca "sem dados" | marca em todos os módulos sem dado |
| leve | "G" maiúsculo nos rótulos | unidade fora da caixa-alta ("RMS · g") |
| leve | Eixo de tempo em horários quebrados | marcas em horários redondos |
| leve | Detalhes cortados no celular ("f…") | detalhe desce para uma linha própria |
| leve | Área morta no esquema; "placa" e "barramento" colados | legenda do esquema embaixo; rótulos afastados |
| leve | "PONTO B" repetido no título "Ponto B" | módulo passou a "Leitura atual" |
| leve | Controles desabilitados com contraste baixo | desabilitado sem transparência |
| leve | "SEM DADOS" repetido na L1 | a marca só aparece quando diz há quanto tempo |
| leve | Bloco "API acordando" duplicado na galeria | um só |

### Rodada 3 (outro revisor independente)

Outro revisor, que também não participou da construção, com as mesmas entradas e as prints refeitas. Veredito: **0 graves, 7 médios, 8 leves**;
nada de cor fora de estado, sombra, cartão ou fonte errada.

| Gravidade | Achado | Correção |
|---|---|---|
| médio | 224, 265 e 280 ainda próximos no tacômetro | afastamento mínimo de 12°: 265 vai para a fileira de fora |
| médio | Tabela de janelas cortada no celular, sem indicação de rolagem | hora fixa à esquerda e aviso "deslize a tabela para o lado" |
| médio | Rótulos do fim da linha colados ao traço | mais afastados da área do gráfico |
| médio | Mapa ilegível no celular (120 intervalos em 165 px) | no celular a API é consultada com um quarto dos intervalos |
| médio | Barra superior do celular alta e mudando de linha conforme o estado | grade com lugares fixos em três linhas |
| médio | No AO VIVO, tabela parada enquanto a leitura dizia "há 0 s"; controles que não se aplicam | tabela acompanha as janelas no período atual; período e segundo quadro saem no AO VIVO |
| médio | Esquema sem selo SIM | selo SIM no módulo |
| leve | Leitura do esquema sobre as peças no celular | sai do desenho no estreito (a rotação está no tacômetro) |
| leve | Canais com identificadores crus | grandeza por extenso como rótulo e o código ao lado (a API não tem nome por extenso; nada foi inventado) |
| leve | Trilha terminando em "/" | termina na página atual |
| leve | "não são medição do torno" cortado no celular | faixa curta no celular |
| leve | Traço solto no tacômetro vazio, "— rpm", rótulo de minigráfico sem gráfico | removidos quando não há valor |
| leve | RMS sem destaque na L3; escala Y com metade vazia | RMS em destaque; degraus 1, 2, 3, 4, 5, 6, 8 |
| leve | Galeria: caso de alarme sem placa; títulos cortados | placa no caso; rótulos de módulo quebram linha |
| aceito | Rótulos do esquema sobre as peças (1920) | têm fundo da superfície e ficam legíveis |
| aceito | Altura do esquema e de "Dispositivos e canais" ditada pelo tacômetro | a legenda do esquema ocupa parte da área; a L1 e o login com uma máquina e um formulário têm área livre por natureza |

As ferramentas foram repetidas depois das correções da rodada 3: o detector de antipadrões, sem achados em L1,
L2 e L3 (1920 e 390) e no login; na galeria, 2 `cramped-padding` (selos) e 1 `flat-type-hierarchy`,
aceitos pelos motivos da rodada 1. break-ui: nenhum caso com rolagem lateral; os piores casos continuam
cobertos por `e2e/piores-casos.spec.ts`.

### Rodada 4 (terceiro revisor independente)

Veredito: **0 graves, 2 médios, 11 leves**. As medições de pixel do revisor confirmaram que âmbar,
vermelho e verde só aparecem na galeria, que o ciano só aparece nos usos permitidos e que nenhuma tela
de 390 px tem rolagem lateral.

| Gravidade | Achado | Correção |
|---|---|---|
| médio | Rótulos do fim da linha ainda dentro da moldura do gráfico | causa achada: o uPlot deixa no canvas o alinhamento à direita do eixo Y, e o texto terminava no ponto em vez de começar nele; alinhamento fixado à esquerda |
| médio | "não" e "normal" em Plex Mono na última janela | palavras em Plex Sans; só os números em fonte de valor |
| leve | Eixo do AO VIVO com uma marca só no celular; lacuna sem legenda no AO VIVO | pelo menos três marcas; legenda de lacuna e de janela normal |
| leve | Colunas Amostras e Marcas coladas, com vão grande depois da hora | a sobra de largura vai para a última coluna |
| leve | Legenda do esquema sem dado na tela; texto do Real vazio repetindo o título | legenda escondida sem dado; texto reescrito |
| leve | Exemplo velho do tacômetro na galeria sem a marca | marca acrescentada |
| aceito | 265 numa segunda fileira, por fora | o ajuste pede as 18 marcas rotuladas; a segunda fileira é a forma de rotular as duas sem sobreposição |
| aceito | Área livre na L1 com uma máquina e ao lado do tacômetro | consequência do conteúdo real; nada foi inventado para preencher |
| aceito | Sparklines contínuas (item 4) | decisão registrada em "Decisões" |
| aceito | Algarismo cortado na borda da tabela rolável do celular | é a rolagem horizontal; o aviso "deslize a tabela" e a hora fixa explicam |

### Rodada 5 (quarto revisor independente)

Veredito: **0 graves, 5 médios, 10 leves**.

| Gravidade | Achado | Correção |
|---|---|---|
| médio | Canais, saturação e modo no contraste de valor vivo com o dado velho; módulo de dispositivos sem marca | cinza de dado velho nesses textos; marca "sem dados há X" no módulo |
| médio | Traço do AO VIVO ligado por cima de um vão de 20 s | mesma regra de lacuna da tendência (vão maior que 2,5 × 5 s quebra a linha) |
| médio | Hora da tabela em ciano no AO VIVO | não era cor: a cor calculada é neutra; a célula fixa (camada própria) recebia suavização de subpixel colorida na captura. A coluna só fica fixa no estreito |
| médio | Placa "SEM DADOS" da L2 em outra fonte | Plex Sans em caixa-alta em todos os estados |
| médio | Contraste do texto de dado velho (estimado a olho) | medido pelos tokens: 5,2:1 (grafite, módulo), 5,8:1 (grafite, fundo), 6,1:1 (grafite, rebaixo), 5,38:1 (claro, módulo), 4,66:1 (claro, fundo), 4,97:1 (claro, rebaixo). A exceção era o hover da linha da máquina (cinza de realce, cerca de 4,1:1), que aparecia porque o mouse da captura ficava sobre ela: o hover passou ao tom rebaixado e a captura tira o mouse da tela |
| leve | Erro de formulário em vermelho (galeria, login) | erro de formulário e de pedido não é alarme da máquina: ícone, borda tracejada e texto, sem vermelho |
| leve | Sparklines estreitas na L1; legenda sem sparkline no Real vazio | sparklines de 128 px; legenda escondida sem série |
| leve | Número do tacômetro encostando nas pontas do arco no celular | tamanho proporcional ao mostrador (até 72 px) |
| leve | Eixo com uma marca só num caso | marcas contadas de verdade, não estimadas |
| aceito | Rotação ao lado do R some no celular | no celular a leitura cairia sobre as peças (rodada 3); a rotação está no tacômetro logo abaixo |
| aceito | L1 "1177 rpm" em Plex Sans | já é Plex Mono (`valor`); nada a mudar |
| aceito | Tabela de 1920 com sobra à direita; área ao lado do tacômetro | consequência do conteúdo real |

### Rodada 6 (quinto revisor independente)

Veredito: **2 graves, 2 médios, 10 leves**. Os dois graves foram uma regressão da rodada 5.

| Gravidade | Achado | Correção |
|---|---|---|
| grave | Sparklines da L1 no celular saindo do campo e cobrindo o valor vizinho (regressão: tinham sido alargadas para 128 px) | 72 px no celular, 128 px no desktop; o grupo do RMS não deixa nada sair dele |
| médio | Saturação e modo com peso de valor vivo no dado velho | palavras de dado velho sem peso, como os números |
| médio | Gráficos da L3 espremidos no celular | margem dos rótulos menor em gráfico estreito |
| leve | Trecho ciano da sparkline de A encostado no rótulo de B (L1, 1920) | grupos afastados |
| aceito | "API ok" ao lado de "sem dados há X" | a API responde e o simulador parou: as duas informações são verdadeiras e independentes |
| aceito | "rpm" minúsculo na L1 e "RPM" nas outras telas | "rpm" é a unidade ao lado do valor; "RPM" é rótulo em caixa-alta |
| aceito | Placa "OPERANDO" parecida com botão | não tem relevo nem cursor de botão; a forma (▶) é o canal de forma do estado |
| aceito | Grade da galeria, tabela larga em 1920, marca de idade na tendência | acabamento ou conteúdo real; o histórico tem hora e não se passa por dado vivo |

### Rodada 7 (sexto revisor independente): sem defeito de direção

Veredito do revisor: **0 graves, 1 médio, 8 leves**. O único médio ("rotação da L1 em Plex Sans")
foi conferido no navegador e é falso positivo: a fonte calculada é `"IBM Plex Mono", monospace` e a
face IBM Plex Mono 500 está carregada (`document.fonts`). Com isso, a rodada 7 não achou defeito de
direção e a revisão parou. Dos leves, foi feito um (o rótulo "RPM" some quando não há rotação); os
demais são de acabamento ou consequência do conteúdo real e já estavam registrados como aceitos
(área livre ao lado do tacômetro, tabela larga em 1920, rotação ao lado do R no celular, fragmentos de
sparkline nas lacunas reais, glifo cortado na borda da tabela rolável, galeria a 390 px).

Ferramentas na última versão do código: lint e tipos sem avisos, 72 testes no Vitest, 18 cenários no
Playwright (com axe nos dois temas e os piores casos), detector de antipadrões sem achados nas telas
de leitura, break-ui sem rolagem lateral em nenhum caso.

### Evidências

As 16 prints finais, comprimidas (1.039 kB no total), estão em
[`docs/evidencias/painel/`](evidencias/painel):

| Arquivo | O que mostra |
|---|---|
| `login-grafite-1920.png` | login |
| `l1-vivo-grafite-1920.png`, `l1-velho-claro-1920.png`, `l1-real-vazio-claro-390.png` | visão geral viva, velha e com a fonte Real vazia |
| `l2-vivo-grafite-1920.png`, `l2-vivo-claro-1920.png`, `l2-velho-grafite-1920.png`, `l2-vivo-grafite-390.png`, `l2-real-vazio-claro-1920.png` | tela da máquina nos dois temas, velha, no celular e Real vazia |
| `l3-vivo-grafite-1920.png`, `l3-vivo-claro-390.png`, `l3-velho-claro-1920.png` | tela do ponto |
| `l3-aovivo-grafite-1920.png`, `l3-aovivo-claro-390.png` | modo AO VIVO |
| `galeria-grafite-1920.png`, `galeria-claro-1920.png` | galeria de componentes (âmbar e vermelho ao lado da cor de sinal) |

As outras prints (44 por rodada, nos dois temas, nas duas larguras e nos estados vivo, velho, simulado
e Real vazio) ficam fora do Git, em `painel/prints/`.

## Contrato esperado para alarmes, OS e referência

Proposta para o prompt que vai implantar a regra de alarme na API. Parte das tabelas que já existem
desde a migração `V1` (`baseline`, `alerta`, `ordem_servico`) e diz o que acrescentar. No painel, as
telas só conversam com dois adaptadores: [`api/adaptadores/alarmes.ts`](../painel/src/api/adaptadores/alarmes.ts)
e [`api/adaptadores/referencia.ts`](../painel/src/api/adaptadores/referencia.ts). Hoje eles devolvem
"indisponível" sem chamar rota; ligar a API será trocar o corpo das funções.

**Referência (`baseline`).** Hoje: `ponto_medicao_id`, `condicao`, `rotacao_rpm`, `metrica`, `media`,
`desvio_padrao`, `n_amostras`, `versao`. Acrescentar:

| Campo | Para quê |
|---|---|
| `etapa` | T0, T1 e T3 têm faixas normais diferentes (desligado, em vazio, cortando). |
| `material_id`, `ferramenta_id`, `avanco_alvo`, `profundidade_corte_mm` (nulos fora do T3) | No corte (T3) a vibração muda com a receita: a referência do corte deve poder ser separada por receita. T0 e T1 não dependem de receita; T2 usa a de T1. |
| `limite_atencao`, `limite_alarme` (ou o múltiplo do desvio-padrão usado) | O painel desenha a régua de desvio e as cores do mapa a partir deles (`Referencia` em `dominio/estado.ts`). |
| `limite_volta` (histerese) | Valor menor que o de disparo, para o alarme só voltar ao normal abaixo dele (ISA-18.2, contra alarme que liga e desliga). |
| `janelas_para_disparar` (atraso) | Quantas janelas seguidas acima do limite antes de disparar (ISA-18.2). |
| `aprendida_de` (lista de ensaios), `criada_em` | Rastreabilidade: de quais gravações normais a faixa saiu. |

Rota sugerida: `GET /api/v1/pontos/{id}/referencia?metrica=&rotacao_rpm=&etapa=&material_id=...`,
devolvendo `{centro, tolerancia, atencao, alarme, volta, janelas_para_disparar, versao}` ou 404 quando
não há referência (o painel mostra SEM REFERÊNCIA).

**Alerta (`alerta`).** Hoje: máquina, janela, ponto ou canal, baseline, métrica, valor, desvio,
`severidade`, `classificacao_falha`, `confianca`, `versao_modelo`, `retorno_tecnico`, `criado_em`,
`reconhecido_em`. Acrescentar:

| Campo | Para quê |
|---|---|
| `prioridade` (`atencao` ou `alarme`) | O que o painel mostra (âmbar ou vermelho, com forma e texto). |
| `estado` (`nao_reconhecido`, `reconhecido`, `normalizado_sem_reconhecimento`, `suprimido`) | Estados da ISA-18.2 que o componente `LinhaAlarme` já desenha. |
| `normalizado_em`, `reconhecido_por`, `suprimido_ate`, `motivo_supressao` | Ciclo de vida completo. |
| `acao_recomendada` (texto, obrigatório) | Uma frase do que fazer. Na ISA-18.2, alarme sem ação definida é evento, não alarme. |
| `versao_firmware`, `versao_calibracao`, `versao_modelo` | Versões gravadas em cada alerta, para saber depois com que firmware, calibração do sensor e modelo ele nasceu. |

Rotas sugeridas: `GET /api/v1/alertas?maquina_id=&estado=` (paginado, não reconhecidos primeiro),
`POST /api/v1/alertas/{id}/reconhecer` (o painel pede segurando o botão), evento SSE `alerta` no fluxo
da máquina.

**Ordem de serviço (`ordem_servico`).** Hoje: máquina, alerta, componente, responsável, número,
`status`, `tipo_falha`, `severidade_acumulada`, `peca_sugerida`, `versao_modelo`, `retorno_tecnico`,
`aberta_em`, `concluida_em`. Acrescentar `acao_recomendada` (texto, obrigatório, em destaque no
`LinhaOrdemServico`) e `observacao_tecnico` (o que o técnico achou ao confirmar ou rejeitar). Rotas:
`GET /api/v1/ordens-servico`, `POST /api/v1/ordens-servico/{id}/retorno` com `confirmada` ou
`rejeitada` (realimenta o modelo).

**Indicadores de desempenho do alarme (para o Diagnóstico).** `GET /api/v1/maquinas/{id}/alarmes/indicadores?de=&ate=`
com alarmes por hora (média e pico; a ISA-18.2 recomenda poucos por hora por operador) e alarmes
repetitivos (o mesmo ponto e métrica disparando várias vezes no período), para ajustar atraso e
histerese.

## Parte B: ponto de partida

O que a Parte B (coleta de ensaios, replay, diagnóstico e alarmes) já encontra pronto, e o que falta.

**Rotas e telas.**

- `/coleta` existe e é protegida por papel (`ExigePapel area="coleta"`, só ADMIN e TECNICO); hoje
  diz que a tela ainda não foi construída ([`telas/coleta/TelaColeta.tsx`](../painel/src/telas/coleta/TelaColeta.tsx)).
- O mapa de papéis está em [`dominio/papeis.ts`](../painel/src/dominio/papeis.ts) e espelha a API
  (`coleta` e `ensaios` só ADMIN e TECNICO).

**API já disponível** (todas no cliente gerado):

| Para | Rotas |
|---|---|
| Coleta | `POST /maquinas/{id}/ensaios` (abrir), `POST /ensaios/{id}/encerrar`, `POST /ensaios/{id}/descartar`, `PUT /maquinas/{id}/coleta/plano`, `GET /maquinas/{id}/coleta/cobertura` |
| Replay | `GET /ensaios/{id}`, `GET /ensaios/{id}/janelas` (em ordem crescente, paginadas), `GET /ensaios/{id}/resumo` |
| Ao vivo durante a coleta | eventos `ensaio` no SSE (só ADMIN e TECNICO) e modo rápido |
| Exportação | `GET /ensaios/exportar.csv` (treino e validação separados) |

**Componentes prontos.**

- `SegurarParaConfirmar`: ação destrutiva sem modal (segurar 1,5 s; funciona pelo teclado). Feito
  para "descartar ensaio".
- `GraficoTendencia` já desenha faixas de ensaio (código do ensaio no topo) e referência (faixa normal
  e linhas de atenção e alarme); `consultaEnsaios` já existe e a L3 mostra as faixas para ADMIN e
  TECNICO.
- `ReguaDesvio`, `SeloAvaliacao` (NORMAL, ATENÇÃO, ALARME, SEM REFERÊNCIA), `MarcadorPonto` com forma
  por estado e `MapaOrdens` com cor de desvio: todos aceitam referência e estão na galeria nos dois
  temas, com âmbar e vermelho ao lado da cor de sinal.
- Fonte de matriz de pontos reservada ao cronômetro de gravação (item 9 da direção).
- `LeitorSse` e `useMaquinaAoVivo` já tratam reconexão, volta à consulta e o evento `ensaio`.

**Pendências.**

- A API não tem referência aprendida nem regra de alarme: `Alerta` e `OrdemServico` existem no banco,
  mas sem rota. Até lá, as telas mostram "SEM REFERÊNCIA" e nenhuma cor de estado.
- Replay: falta a tela que percorre `GET /ensaios/{id}/janelas` (o gráfico e a tabela da L3 servem
  de base).
- Diagnóstico (acionamento × processo) depende da classificação, que ainda não começou.
- Comparar pontos num mesmo gráfico: quando existir, aplicar o item 4 da direção (tons e estilos de
  linha por ponto, com a letra no fim da linha).
- Publicação do painel (site estático) e `CORS_ORIGENS` da API publicada com o domínio dele.
