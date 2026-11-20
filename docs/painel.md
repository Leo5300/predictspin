# Painel web (centro de controle)

O painel é a interface web do PredictSpin. A Parte A é a leitura: máquinas, pontos de medição e as
janelas de vibração que chegam à API, ao vivo. A Parte B acrescenta a coleta de ensaios pelo celular
(receita, gravação, eventos marcados, sessão encadeada, cobertura do protocolo e exportação), o replay
de ensaios gravados, o diagnóstico (dispositivos, qualidade, catálogos, usuários), a tela de alarmes
e ordens de serviço com estado vazio honesto, a paleta de comandos (Ctrl+K) e as explicações "?".

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
| `npm test` | Vitest (domínio, componentes de instrumento, glossário e a prova de que a galeria não entra no build) |
| `npm run test:e2e` | Playwright contra o compose local; os testes ligam o próprio simulador |
| `npm run api:gerar` | exporta o contrato da API local e regera os tipos do cliente |
| `npm run api:conferir` | falha se o `openapi.json` versionado difere do que a API local publica |
| `node scripts/medir-producao.mjs` | com o build servido por `npx vite preview --port 5173`: carga inicial, rotas sob demanda e violações da Content-Security-Policy |

Os testes de ponta a ponta leem as credenciais do `.env` da raiz e **ignoram** variáveis de ambiente
do computador (que podem apontar para a API publicada). O simulador que eles ligam roda sempre com
`--url http://localhost:8080`.

## Estrutura de pastas

```
painel
├── e2e/                    Playwright: login, papéis, leitura, AO VIVO, eventos, coleta, replay,
│   │                       diagnóstico, acessibilidade (axe), piores casos, prints de revisão
│   └── apoio/              ambiente local, sessão, API e o simulador ligado pelos testes
├── scripts/                exportar o contrato, lançador do Vitest, teste "galeria fora do build",
│                           medição do build de produção
├── src/
│   ├── api/                cliente gerado (esquema.d.ts), sessão, saúde, eventos (SSE), consultas,
│   │   │                   coleta, diagnóstico
│   │   └── adaptadores/    alarmes e referência (o único lugar que muda quando a API tiver a regra)
│   ├── dominio/            regras puras e testadas: formatação pt-BR, idade e limiares, estado,
│   │                       escalas e típico do mapa, lacunas, leitor de eventos, modo rápido,
│   │                       tacômetro, coleta (grade, sugestão), receita, nomes, sessão, pré-voo,
│   │                       fita, instruções, replay, glossário
│   ├── estado/             preferências (tema, fonte), relógio, transporte, meta da coleta
│   ├── hooks/              máquina ao vivo, modo rápido, frescor, coleta, tela acesa, paleta
│   ├── componentes/
│   │   ├── ui/             base shadcn (Base UI) restilizada: botão, campo, alternador, dica, tabela,
│   │   │                   balão "?" (explica)
│   │   ├── instrumento/    Leitura, Tacometro, EsquemaTorno, MapaOrdens, GraficoTendencia,
│   │   │                   Sparkline, ReguaDesvio, Selos, MarcadorPonto, Idade, Estados...
│   │   ├── coleta/         REC, cronômetro, fita, cartão "o que fazer agora", matriz, campos da receita
│   │   ├── alarmes/        linhas de alarme e de ordem de serviço (ISA-18.2; só na galeria por ora)
│   │   └── casca/          barra superior, paleta de comandos
│   ├── rotas/              rotas por arquivo (TanStack Router)
│   ├── telas/              login, visão geral (L1), máquina (L2), ponto (L3), coleta (entrada,
│   │                       preparar, gravação, resumo, ensaios, replay), diagnóstico, alarmes, apoio
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
| `/coleta` | coleta: próxima sugerida, matriz de cobertura, gravação em andamento e resumo | ADMIN, TECNICO |
| `/coleta/preparar` | etapa, condição e rotação; sessão encadeada; receita; checagem antes de gravar | ADMIN, TECNICO |
| `/coleta/ensaios` | ensaios gravados: filtros, correção da receita com histórico, eventos, descarte, CSV | ADMIN, TECNICO |
| `/coleta/ensaios/:id/replay` | replay de um ensaio gravado (1×, 4×, 16×) | ADMIN, TECNICO |
| `/diagnostico` | dispositivos, qualidade, "Sobre"; atalho para ensaios e catálogos (ADMIN e TECNICO); usuários (só ADMIN) | ADMIN, TECNICO, OPERADOR |
| `/alarmes` | alarmes e ordens de serviço: diz que a regra de alarme ainda não existe na API | ADMIN, TECNICO, OPERADOR |

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
| Mapa de ordens comparado com o típico de cada linha (Parte B) | Do mínimo ao máximo, a variação normal virava xadrez; do zero ao máximo, a máquina saudável era um tapete, mas nada dizia o que fugiu. Agora cada célula é comparada com a mediana da linha na mesma marcha: ±15 % é o mesmo tom, acima disso o contraste cresce sem degraus, abaixo vira pontilhado; intervalo incompleto (borda de lacuna) fica neutro; a leitura em texto diz qual ponto, qual medida e desde quando. |
| Vermelho do REC | Convenção de gravador e única exceção ao "vermelho só para alarme": só o botão REC e o ponto que pulsa enquanto grava. Nunca aparece fora da Coleta. |
| Sessão de coleta só no navegador | A sessão (T0 opcional, T1 → T2 → T3 na mesma rotação, com a mesma receita) existe para o painel; na API cada gravação é um ensaio. Fica no `localStorage` e volta ao recarregar. |
| Meta da cobertura no navegador | A API recebe a meta por consulta (padrão 3) e não a guarda; o painel guarda a escolhida neste navegador. |
| Grade de cobertura do painel | A API cruza todas as etapas com todas as condições; no protocolo a condição só muda o corte e o T0 é a 0 rpm. O painel monta T0 × normal × 0 rpm, T1 e T2 × normal × plano, T3 × 6 condições × plano, pedindo à API as rotações 0 + plano. |
| Próxima sugerida | A célula com menos ensaios válidos em relação à meta; no empate, a ordem T0 → T1 → T2 → T3, rotações crescentes, normal antes das outras e sensor solto por último (`dominio/coleta.ts`). |
| Faixas da receita | Avanço 0,01 a 2 mm/volta (só no painel: a API aceita ≥ 0 e não foi apertada, para não mudar o contrato), profundidade 0,05 a 10 mm e diâmetro 1 a 500 mm (também na API). Aviso, sem bloquear, para avanço abaixo de 0,03 ou acima de 0,6 mm/volta, profundidade acima de 5 mm e diâmetro abaixo de 5 ou acima de 300 mm. |
| Similaridade de nomes no painel | Pares de letras (Dice), distância de edição e "um nome contido no outro" (só se cobrir metade do maior); vale o maior. A partir de 0,55 o item aparece como "parecido". A lista é pequena; a unicidade é garantida pela API (409 devolve o existente). |
| Avisos no topo no celular | No celular a parte de baixo é a zona do polegar (REC, Encerrar, Marcar evento); um aviso ali cobria os controles. |
| Replay com padrão próprio | Faixa "REPLAY" com trama vertical (nem a hachura diagonal do simulado, nem âmbar ou vermelho); a barra superior troca a idade da última janela por REPLAY; o tacômetro do replay destaca a marcha em texto forte, não na cor de sinal. |
| Adaptadores de alarme e referência | As telas só falam com `api/adaptadores/alarmes.ts` e `referencia.ts`, que hoje devolvem "indisponível" sem chamar rota. Ligar a API futura é trocar esses arquivos. |
| Exemplos do glossário | Os números dos exemplos do "?" são texto explicativo fixo, sempre começando por "Exemplo:"; não são medição e não ferem a regra de nenhum valor inventado (todo número medido exibido vem da API). |
| Content-Security-Policy no build | O endereço da API vem de `VITE_API_URL`; o `render.yaml` não monta cabeçalho com variável, então o build escreve a política numa `<meta>` do `index.html`, com `connect-src` só para a própria origem e a da API. |
| Rotação sem separador de milhar ("1180") | Pedido do ajuste; a fonte de matriz de pontos lê como mostrador. |
| `ultimo_contato` combinado com a última janela | A API grava o contato com resolução de 10 s (para não travar a linha do dispositivo a cada janela); a janela recebida é um contato mais recente. |
| Lançador próprio do Vitest (`scripts/vitest.mjs`) | No Windows, `c:` e `C:` na pasta de trabalho carregavam o Vitest duas vezes ("failed to find the current suite"); o lançador normaliza a letra da unidade. |
| Erros de formulário e de pedido sem vermelho | Vermelho e âmbar são só desvio e alarme da máquina (ISA-101). Campo inválido, senha errada ou falha ao ligar o AO VIVO aparecem com ícone, borda tracejada e texto. |
| Troca de tela pelo roteador (`document.startViewTransition`) | O `<ViewTransition>` do React só anima atualizações dentro de transição, e a navegação do roteador é síncrona: medido no navegador, ele nunca disparava. O roteador anima só quando o caminho muda (período, página e mapa trocam seco). |
| Galeria fora do build | Exemplos com dados inventados só existem em testes e na galeria; um teste roda o build de produção e procura a marca da galeria. |
| Marcado = afundado | Alternadores, chips e células de meta atingida marcados ficam afundados (fundo rebaixado, borda forte, negrito). O preenchimento da ação principal é só da ação: a revisão B2 viu escolha e ação iguais. |
| Matriz de pontos só na rotação viva | Com dado velho ou no replay, o número do tacômetro sai em Plex Mono: o mostrador "aceso" é a convenção do vivo (item 9; revisões B2 a B4). |
| Coleta no celular: cartão preso no topo, motivos na barra | O cartão "o que fazer agora" fica preso no topo ao preparar e ao gravar; os motivos do evento aparecem na barra de baixo, no lugar de Marcar evento e Encerrar, e o descarte fica fora da zona do polegar (item 17; revisões B2 a B4). |
| Botão de toque de 56 px | Tamanho `toque` no botão base: o `min-h-11` do celular vencia qualquer `min-h-14` passado por classe. |
| Selo GRAVADO no replay | Cada módulo do replay leva o selo, na trama vertical do replay, como o SIM no simulado. |
| AO VIVO conferido com a API | A cada 15 s as janelas do último minuto e meio são buscadas e mescladas às recebidas por evento; um evento perdido não vira lacuna falsa. |

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

### Evidências da Parte A

As 16 prints da Parte A foram substituídas pelas 24 da Parte B (abaixo); continuam no histórico do Git
(commit `639c28d`).

### Revisão da Parte B

Mesmo método da Parte A, agora com todas as telas: login, paleta de comandos, balão "?", L1, L2 e L3
(vivo, velho e fonte Real vazia), L3 AO VIVO, coleta (entrada, preparar, receita, checagem, gravando,
evento, resumo, ensaios), replay, diagnóstico, alarmes e galeria (geral, mapa de ordens, alarmes);
1920×1080 e 390×844; grafite e claro. Prints em `painel/prints/` (fora do Git), geradas por
`e2e/prints.spec.ts` (108 por rodada).

Cinco rodadas: a B1 feita por quem construiu; da B2 à B5, cada uma por um revisor novo, que não
participou da construção e recebeu só as prints, a direção e a lista "não fazer". A regra era parar
quando uma rodada não achasse defeito de direção: B2, B3 e B4 acharam (itens 17 e 9); a B5 não.

#### Rodada B1 (feita por quem construiu)

| Achado | Onde | Correção |
|---|---|---|
| Nomes do catálogo espremidos ao lado dos botões (uma palavra por linha) | Diagnóstico 390 | nome em cima, ações embaixo |
| Tabela de usuários quebrando o e-mail letra a letra | Diagnóstico 390 | linhas empilhadas no celular |
| Último contato cortado; modo "normal 5 s" em duas linhas | Diagnóstico 390 | linhas empilhadas; modo sem quebra |
| Atraso de envio negativo (−5 s) | Diagnóstico | coluna "recebido − medido" |
| "Aço 4" sugerido como parecido com "aço 4340 temperado" | Receita (break-ui) | "contido" só conta se cobre metade do nome |
| "Nenhuma janela chegou ainda" com 120 janelas na fita | Gravação de 10 min (break-ui) | texto conforme o caso |
| Dois-pontos da Doto lido como "‡" no cronômetro | Gravação | separador desenhado |
| "T0 Normal · 0 rpm" na sugestão | Coleta | "Torno desligado · 0 rpm" |
| Aviso (toast) cobrindo a zona do polegar | Gravação 390 | avisos no topo no celular |

Ferramentas da rodada B1:

- Detector de antipadrões (com `npx`, telemetria desligada, fora do `package.json`), 10 telas × 1920
  e 390, pela porta de depuração de um Chromium já logado: placeholder com contraste 4,3:1 em dois
  campos simples do preparar, palavra sozinha na última linha, selo de idade sem folga e três títulos
  desequilibrados na galeria. Corrigidos (placeholder no tom de apoio em todo campo,
  `text-wrap: pretty` em parágrafos, `balance` em títulos). Depois: nenhum achado, exceto
  `repeating-stripes-gradient` em todas as telas, que é a hachura de dado simulado exigida pela
  direção (item 5).
- break-ui: `e2e/piores-casos-coleta.spec.ts` (nomes longos, 100 itens de catálogo, 100 ensaios,
  plano de 18 rotações, API fora, ensaio sem janelas, gravação de 10 minutos), além de
  `e2e/piores-casos.spec.ts` da Parte A.
- Build de produção servido localmente: a página quebrava ("Cannot read properties of null (reading
  'useContext')"), com o React duplicado no pacote quando o build roda de `c:\` minúsculo no Windows.
  Corrigido no `vite.config.ts` (veja [Publicação](#publicação)); a política de segurança passou sem
  violação em 7 telas depois de liberar fontes `data:` e tirar o `eval` do Zod.

#### Rodada B2 (revisor independente)

Feita por um revisor que não participou da construção e recebeu só as 108 prints, a direção e a
lista "não fazer". Veredito: **3 graves, 13 médios, 16 leves**, com defeito de direção (itens 17 e 9).

| Gravidade | Achado | Correção |
|---|---|---|
| grave | "Marcar evento", "Encerrar", descarte e motivos do evento com cerca de 44 px no celular | causa: o botão base tem `max-md:min-h-11`, que vencia o `min-h-14`; tamanho de botão `toque` (56 px em qualquer tela) em todos os controles da coleta |
| grave | Cartão "O que fazer agora" atrás da barra fixa durante a gravação | no celular, o cartão vem logo abaixo da faixa GRAVANDO; a barra fixa ficou só com Marcar evento e Encerrar |
| grave | Tacômetro do replay em matriz de pontos | no replay o número sai em Plex Mono (a matriz é só da rotação ao vivo da L2) |
| médio | Cronômetro com o "0" mais alto que ":11" | algarismos e separador numa linha só; o ":" de verdade fica no texto, invisível (o teste de 10 minutos tinha acusado "1014") |
| médio | Marcha mais próxima em ciano no tacômetro | texto forte (traço maior e negrito), sem a cor de sinal |
| médio | Matriz de cobertura cortada no celular, sem aviso | células de 56 px cabem com 3 rotações; com mais, aparece "Deslize a matriz para o lado" |
| médio | Faixas de ensaio vazias ou com "TORN…", bloco de riscos no celular | ensaios colados viram um grupo "N ensaios"; código só inteiro, quando cabe; legenda reescrita |
| médio | Opção escolhida com o mesmo preenchimento da ação principal (grafite) | marcado = afundado (fundo rebaixado, borda forte, negrito) em todos os alternadores e nos chips do preparar |
| médio | Resumo diz "célula destacada" e nada a distingue | contorno tracejado próprio na célula da gravação |
| médio | "Segure para descartar" na zona do polegar | no celular, o descarte saiu da barra fixa para o fim da página |
| médio | Aviso "Receita corrigida" transparente sobre a lista | efeito da captura (aviso fixo, a meio caminho de sumir, numa print de página inteira); a captura espera os avisos irem embora |
| médio | Dados de teste no Diagnóstico ("Latão e2e…", "operador.e2e…") | aceito: é o que o banco local tem depois das suítes; a tela mostra o que a API devolve |
| médio | Tacômetro velho parecido com o vivo (1920) | aceito: número e ponteiro estão no tom fraco, como todos os valores velhos da tela, e cada módulo diz "sem dados há X"; a impressão vem dos pontos da fonte de matriz |
| médio | Replay parecido com a tela ao vivo | faixa REPLAY permanente com trama própria, "REPLAY" no lugar da idade na barra superior e o tacômetro agora em Plex Mono |
| médio | Alarme não reconhecido com o símbolo apagado (galeria) | aceito: é o pisca lento do estado não reconhecido, capturado na fase apagada |
| médio | Cabeçalho alto no celular (cerca de 175 px) | aceito: navegação, fonte Real/Simulado e faixa SIM são exigidas; o espaço da gravação foi recuperado tirando o descarte da barra fixa |
| leve | Letras "T" amontoadas na faixa de ensaio do mapa | rótulo só quando cabe inteiro (código na dica) |
| leve | Subtítulos de módulo cortados com reticências no celular | o detalhe desce para a própria linha e quebra |
| leve | Mapa dizendo "Normal" com o dado velho | primeira linha: "Sem janela nova desde HH:MM: a leitura abaixo vale até lá" |
| leve | Caixa de marcar da sessão com 18 px | linha de 56 px e caixa de 24 px |
| leve | Descarte embaixo do histórico de correções | junto de "Corrigir receita" |
| aceito | Balão sobre o texto; rótulos próximos no tacômetro; "sem dados há X" em cada módulo; login e tabelas com área livre em 1920; comando do `captura.py` à vista | decisões já registradas na Parte A ou pedidas (o comando de captura é exigido no fluxo de gravação) |

#### Rodada B3 (outro revisor independente)

Revisor novo, mesmas entradas, prints refeitas depois das correções da B2. Veredito: **1 grave, 10
médios, 13 leves**; o teste final ("parece gerado automaticamente?") passou, sem cor fora de estado,
sombra, gradiente ou rolagem lateral. O grave ainda era do item 17.

| Gravidade | Achado | Correção |
|---|---|---|
| grave | Ao marcar evento no celular, os motivos ficavam abaixo da gravação e era preciso rolar: o cartão "o que fazer agora" e o cronômetro saíam da tela | no celular os motivos aparecem na própria barra de baixo, no lugar de Marcar evento e Encerrar |
| médio | Célula com meta atingida preenchida como o botão "Preparar" | afundada, com borda forte e ✓; vazia em texto de apoio |
| médio | Lista de sugestões da receita atrás da barra fixa no celular | o campo sobe ao receber foco |
| médio | Balão "?" cobrindo o valor que explica | abre acima do termo |
| médio | Replay no celular sem nada dizendo "reprodução" depois de rolar | faixa REPLAY presa no topo |
| médio | Tacômetro velho com contraste parecido com o vivo (claro) | com dado velho o número sai em Plex Mono no tom fraco; a matriz de pontos ficou só para a rotação viva |
| médio | Trecho sem dado no começo do mapa parecido com "pontilhado = abaixo" | contorno tracejado de lacuna, o símbolo da legenda |
| médio | Usuários de teste desativados com o peso dos ativos, sem filtro | ocultos até "mostrar desativados", em tom de apoio |
| médio | Texto de exemplo do campo de catálogo parecido com o valor digitado | aceito: tom de apoio (contraste AA) contra o texto forte do valor |
| médio | Números da gravação "em Plex Sans" | falso positivo: os números usam a classe `valor` (Plex Mono, `tabular-nums`), a mesma da rotação da L1, cuja fonte calculada foi conferida no navegador na Parte A |
| médio | "Corte com a receita indicada" com a receita em branco | aceito: texto do protocolo, fixo por pedido; a receita é opcional |
| leve | Selo DESCARTADO riscado | sem risco; código do ensaio descartado em tom de apoio |
| leve | Paleta sem como fechar no toque | botão "Fechar" no celular |
| leve | Passos do preparar alinhados à direita no celular | linha própria, à esquerda |
| leve | "Treinar" colado no fim da página | folga embaixo |
| aceito | Rótulos próximos no tacômetro, rótulo do esquema sobre o carro, área livre em 1920, cabeçalho do celular, tamanhos das leituras da L2, pisca do alarme na galeria, barra fixa no meio de prints de página inteira (efeito da captura), dois-pontos do cronômetro com o recuo da fonte, sparklines no tom normal com dado velho (o valor e a marca dizem a idade) | decisões já registradas ou efeitos da captura |

#### Rodada B4 (terceiro revisor independente)

Veredito: **1 grave, 8 médios, 15 leves**. Sem cor de marca, gradiente, sombra, emoji, fonte proibida
nem âmbar ou vermelho fora da galeria e do REC. O grave voltou a ser o item 17, agora causado pela
correção da B3: o campo de catálogo subia para o topo e empurrava o cartão para fora da tela.

| Gravidade | Achado | Correção |
|---|---|---|
| grave | Cartão "o que fazer agora" fora da vista na Receita do preparar (celular) | cartão preso no topo no celular, ao preparar e ao gravar; o campo sobe só até logo abaixo dele |
| médio | "163 janelas normais no gráfico" contra "1–15 de 162 janelas (normais e rápidas)" | gráfico e tabela são consultados em momentos diferentes e, com dado chegando, se cruzavam: o número saiu da legenda do gráfico; a contagem do período fica na tabela |
| médio | AO VIVO com lacuna onde a tabela tem janelas rápidas | causa: janelas recentes vinham de uma consulta e depois só dos eventos; um evento perdido virava lacuna. A cada 15 s as janelas do último minuto e meio são conferidas com a API e mescladas (a primeira versão substituía a lista e o teste do AO VIVO acusou janelas sumindo) |
| médio | Replay com o mesmo peso da tela ao vivo | selo GRAVADO, na trama vertical do replay, em cada módulo, além da faixa presa no topo |
| médio | Aviso de rolagem da matriz em um tema e não no outro | a medição acontecia antes de as fontes carregarem: a tabela também é observada |
| médio | Última linha da tabela de qualidade cortada | tabela sem altura máxima (são 20 janelas) |
| médio | "21" da Repetição parecido com valor preenchido | era o exemplo (a sugestão): agora "em branco = 21" e a linha de ajuda explica |
| médio | Cancelar da folha de evento com 44 px, sem borda | 56 px, com borda |
| médio | Células de atenção e alarme do mapa (galeria) só pela cor | triângulo (atenção) e losango (alarme) desenhados na célula, as mesmas formas do resto do painel; legenda com as formas |
| leve | "1 janelas rápidas", "1 ativos" | concordância |
| leve | Espaço largo em "Ponto   A" na paleta | corrigido |
| leve | Números da L1 e da gravação "em Plex Sans" | falso positivo, conferido no navegador nesta rodada: fonte calculada `"IBM Plex Mono", monospace`, `tabular-nums` |
| aceito | Rótulos próximos no tacômetro e no fim das linhas do replay, colunas que "andam" na lista de ensaios, coluna larga da matriz em 1920, balão sem seta, comando do `captura.py`, cabeçalho do celular, textos de legenda, pisca do alarme na galeria, ponteiro velho ("possível": já está no tom fraco) | decisões já registradas, conteúdo real ou efeito da captura |

#### Rodada B5 (quarto revisor independente): sem defeito de direção

Veredito: **0 graves, 2 médios, 14 leves**, e o revisor concluiu que não há defeito de direção; com
isso a revisão parou. Nenhum âmbar ou vermelho de alarme fora da galeria e do REC, nenhum gradiente,
sombra genérica, emoji ou fonte fora da família IBM Plex.

| Gravidade | Achado | O que foi feito |
|---|---|---|
| médio | Texto de exemplo "em branco = 25" cortado no campo Repetição (1920) | o exemplo saiu; a linha de ajuda diz o que vale em branco |
| médio (possível) | Valores do replay com o peso dos valores vivos | aceito: o valor gravado é o mesmo dado, no mesmo estado normal; o que o distingue é a faixa REPLAY (presa no topo no celular), o selo GRAVADO em cada módulo e "REPLAY" no lugar da idade na barra superior |
| leve | Título da folha de evento fora da caixa-alta | rótulo em caixa-alta, como no desktop |
| leve (possível) | "987.7 mi rpm" na galeria | falso positivo: `formatarNumero(987654321,123, 0)` escreve "987.654.321", ponto de milhar do pt-BR |
| leve (possível) | Ação principal clara no tema grafite | intencional: no tema escuro, "grafite" é o tom mais claro da escala neutra; a ação principal é preenchida e nenhuma outra coisa usa esse preenchimento |
| aceito | Coluna da matriz encostada na borda (com aviso de rolagem), Encerrar fora da tela com a folha de evento aberta (Cancelar volta), REC 10 px acima da barra, "sem dados há X" em cada módulo, título da L1 menor, área livre em 1920, rótulos do tacômetro, unidade "mm/volta", cabeçalho do celular, pisca do alarme e largura da ação recomendada na galeria | decisões já registradas, conteúdo real ou efeito da captura |

Ferramentas na versão final: detector de antipadrões só com a hachura de simulado nas 10 telas (1920 e
390); Vitest 132 testes; Playwright 38 cenários com axe em todas as telas nos dois temas; build de
produção sem violação da política de segurança.

### Evidências da Parte B

As 24 prints finais (rodada B5), comprimidas (1.145 kB no total), estão em
[`docs/evidencias/painel/`](evidencias/painel), com o relatório de testes e medidas em
[`LEIA.md`](evidencias/painel/LEIA.md):

| Arquivo | O que mostra |
|---|---|
| `login-grafite-1920.png`, `paleta-grafite-1920.png` | login e paleta de comandos |
| `l1-vivo-grafite-1920.png`, `l1-velho-claro-1920.png`, `l1-real-claro-390.png` | visão geral viva, velha e com a fonte Real vazia |
| `l2-vivo-grafite-1920.png`, `l2-vivo-claro-1920.png`, `l2-velho-grafite-1920.png`, `l2-vivo-grafite-390.png` | tela da máquina com o mapa de ordens comparado ao típico |
| `l3-vivo-grafite-1920.png`, `l3-aovivo-grafite-1920.png`, `l3-aovivo-claro-390.png` | tela do ponto e modo AO VIVO |
| `coleta-entrada-grafite-390.png`, `coleta-preparar-claro-390.png`, `coleta-receita-grafite-390.png`, `coleta-checagem-grafite-390.png` | coleta no celular: sugestão e matriz, gravação, receita, checagem |
| `coleta-gravando-grafite-390.png`, `coleta-evento-claro-390.png` | gravando (REC, cronômetro, fita, cartão) e marcando evento |
| `coleta-resumo-grafite-1920.png`, `coleta-ensaios-claro-1920.png` | resumo da gravação e ensaios gravados |
| `replay-grafite-1920.png` | replay de ensaio gravado |
| `diagnostico-grafite-1920.png`, `alarmes-claro-1920.png` | diagnóstico e alarmes (estado vazio honesto) |
| `galeria-mapa-grafite-1920.png` | casos do mapa de ordens (normal, troca de marcha, B fugindo, abaixo, lacuna, saturação, referência) |

## Como gravar uma sessão de coleta (passo a passo)

Para quem está em pé ao lado do torno, com o celular na mão. Só o técnico liga e opera o torno; a
proteção da placa fica fechada.

1. **Escolha a fonte.** No topo, **Real** grava medição do ESP32; **Simulado** grava o simulador (tudo
   fica hachurado com o selo SIM e o ensaio nasce simulado). Para o artigo, só Real.
2. **Abra a Coleta.** No topo aparece a **próxima gravação sugerida** (a célula que tem menos gravações
   em relação à meta). Toque em **Preparar**, ou toque em qualquer célula da matriz para escolher outra.
3. **Gravação (passo 1).** Confira a etapa (T0 desligado, T1 em vazio, T2 aproximação sem contato, T3
   corte), a condição (só muda no T3) e a rotação. Para gravar T1, T2 e T3 seguidos na mesma rotação,
   marque **Gravar a sequência nesta rotação** (e, se quiser, **começar pelo T0**).
4. **Receita (passo 2, fora do T0).** Preencha só o que souber: material, ferramenta, avanço,
   profundidade, diâmetro, fluido. O que ficar em branco não atrapalha. Ao digitar um nome, o painel
   procura no catálogo e pergunta "é esse?" se houver um parecido; só cria um item novo depois da sua
   confirmação. **Repetir a receita da última gravação** copia tudo de uma vez.
5. **Checagem (passo 3).** Leia o cartão **O que fazer agora** e faça o que ele diz (no T1, ligue o
   torno e espere a rotação estabilizar). A lista confere A, B e C chegando, a rotação perto do alvo,
   saturação, amostras, ensaio aberto e a origem do dado. Só não deixa gravar sem dado chegando ou com
   outro ensaio aberto; o resto só avisa o que fazer.
6. **REC.** Toque no botão redondo. O ponto vermelho pulsa, o cronômetro conta e cada janela que
   chega vira um traço na fita. Deixe pelo menos **60 s** (a marca discreta na fita); não para
   sozinho. Se algo fora do plano acontecer (pancada na bancada, cavaco enroscado, máquina vizinha),
   toque em **Marcar evento** na hora e escolha o motivo: vale o instante do toque.
7. **Encerrar.** Um toque. O resumo mostra duração, janelas, saturadas, eventos, rotação média e a
   receita; a célula da matriz carimba. Na sessão, o botão grande já é a próxima etapa ("Preparar T2 a
   450 rpm"): repita os passos 5 a 7. Para jogar fora uma gravação ruim, **segure** o botão de
   descartar (é marcada, não apagada).
8. **Depois.** Em **Ensaios gravados** dá para corrigir a receita (cada mudança fica no histórico),
   rever no **Replay** e **Exportar CSV** para o treino. Recarregar a página no meio de uma gravação
   não perde nada: a tela volta gravando, e a sessão fica guardada no navegador.

## Alarmes, OS e referência (parte A, implantada)

O contrato proposto antes foi substituído pela implementação descrita em [`docs/alarmes.md`](alarmes.md).
As telas só falam com dois adaptadores, [`api/adaptadores/alarmes.ts`](../painel/src/api/adaptadores/alarmes.ts)
e [`api/adaptadores/referencia.ts`](../painel/src/api/adaptadores/referencia.ts), que chamam as rotas reais
(contrato em `painel/openapi.json`). Nada de dado de exemplo fora da galeria.

- **Estado e cor.** NORMAL, ATENÇÃO e ALARME (cor + forma + texto) só onde a API comparou o ponto com a
  referência; senão selo neutro que diz por quê, cada um com o seu "?": sem referência, sem referência
  completa, calibração diferente, não avaliável. "Referência genérica" acompanha o estado no corte. Valores em
  desvio (z acima dos limites da API) ficam âmbar ou vermelho com forma e texto para leitor de tela; o resto
  continua neutro. A régua do desvio é em z e mostra o típico.
- **Mapa de ordens.** Com referência, âmbar e vermelho só nas células cujo maior z passou dos limites
  (`z_max` da série); o tom continua a comparação com o típico do período, e a legenda diz qual está em uso.
- **Eventos.** `alerta`, `os` e `recuperacao` entram no cliente SSE. `recuperacao` invalida as consultas do
  agora e as de período que cruzam o intervalo recuperado (`afetadaPelaRecuperacao`).
- **Glossário.** Onze termos novos; os limites citados nos textos vêm de `GET /alarmes/limites`, nunca à mão.
- **Telas.** Alarmes (lista ao vivo, filtros, reconhecer segurando, suprimir inline só ADMIN, OS assumir e
  concluir com retorno), Coleta (módulo Referência: recalcular e cobertura por marcha e etapa), Diagnóstico
  (limites, indicadores, severidade, deriva, piso de ruído, calibração).
- **Testes.** Vitest (`dominio/alarme.test.ts`), `e2e/alarmes.spec.ts` (fluxo completo com o perfil
  `tempos-curtos` da API), `e2e/acessibilidade-alarmes.spec.ts` (axe nos dois temas, 10 casos, sem violação
  séria ou crítica). A suíte `acessibilidade.spec.ts` antiga mede páginas com o Vite em modo de
  desenvolvimento e estoura o tempo de 90 s nas telas da máquina e do ponto; rodou sem falha com o build de
  produção (`vite preview`) só nas outras telas. Isso já acontecia antes desta parte (conferido no commit
  anterior) e não foi corrigido aqui.

### Revisão de design da parte A

**Rodada A1 (feita por quem construiu).** Defeito: em OS aberta, o formulário de conclusão aparecia sempre
aberto, repetido em cada linha. Corrigido: botão "Concluir OS…" abre o formulário sob demanda.

**Rodada A2 (revisor independente, só com prints, direção e lista "não fazer").** Defeitos aceitos e
corrigidos: (1) ícone de alarme que já voltou ao normal estava âmbar/vermelho; agora fica cinza; (2) bloco da
ação recomendada nas OS era um cartão dentro de cartão em fonte grande; agora é uma linha de 1 px com texto de
15 px; (3) módulo Referência da Coleta ficava espremido em uma coluna; agora ocupa a largura toda. Não
aceitos: valores de cobertura como "26/3" (matriz de coleta antiga, fora desta parte); tabela do Diagnóstico a
390 px (rola dentro do próprio módulo, a página não rola de lado); "carregando" no módulo Qualidade
(já existente). A leitura PICO, 1X, 2X e 3X a 390 px da tela da máquina cortava com reticências quando os
quatro valores estavam em desvio, por causa da forma ao lado do número. Corrigido depois da revisão: a grade
das leituras (`LeiturasDoPonto`) fica em 2 colunas quando o módulo tem menos de 28rem e em 3 acima disso;
teste `e2e/piores-casos.spec.ts` ("tela da máquina a 390 px: pico, 1X, 2X e 3X em desvio cabem sem
cortar", valores de dois dígitos e as cinco leituras em desvio; com a grade antiga acusava 12 valores
cortados) e caso na galeria. Prints `l2-vivo-*-390.png` refeitos com o simulador em modo severo.

Evidências: [`docs/evidencias/painel/`](evidencias/painel/) (16 prints novos, 1920 e 390, dois temas, das
telas Alarmes, máquina, Diagnóstico, Coleta e ponto; os antigos das mesmas telas foram substituídos). Os
prints foram tirados com o simulador em modo severo, para aparecerem atenção, alarme e OS: dado simulado,
prova o encadeamento, não a detecção real.
## IA parte B: Modelos, detalhes de alerta e OS, Diagnóstico da IA

Contrato em [`docs/ia.md`](ia.md). As telas só falam com [`api/adaptadores/modelos.ts`](../painel/src/api/adaptadores/modelos.ts)
e com o adaptador de alarmes; textos e contas em [`dominio/modelos.ts`](../painel/src/dominio/modelos.ts).

- **Modelos** (`/coleta/modelos`, no menu "Modelos"; ADMIN e TECNICO treinam, só ADMIN ativa, OPERADOR só vê):
  botão Treinar com o trabalho ao vivo pelo evento `treino` ("acordando o serviço de treino", treinando,
  concluído, falhou; sem serviço, o comando do notebook); lista de versões (estado com marca e texto, data,
  autor, janelas por classe e por origem); detalhe com a matriz de confusão (tabela com os números; intensidade
  num tom só, a fração da linha), recall por classe, F1 macro, validação por ensaio e por dia, regra × modelo,
  importância top 10 (barras num tom só); Ativar com a comparação com a versão ativa antes de confirmar; selo
  "dado simulado: não é resultado".
- **Detalhe do alerta** (`/alarmes/{id}`): estado, nível, prioridade, explicação, ação recomendada, versões,
  ensaio e condição, histórico, segunda opinião na abertura e a mais recente, link para a OS e para o ponto no
  período do alerta.
- **Detalhe da OS** (`/ordens/{id}`): dados, alerta de origem, segunda opinião, assumir e concluir com
  confirmada/rejeitada, comentário e a condição encontrada opcional (também no formulário da lista).
- **Diagnóstico**: módulo "Segunda opinião (IA)" com a versão ativa, caminho (ONNX), se roda e por quê, avisos
  (referência mudou), erros de inferência, última hora (janelas, anomalias, classes), limites da IA lidos da API,
  canais da fusão e tendência (desabilitados). O módulo da regra ganhou "na fila" e "descartadas da fila".
- **Glossário**: oito termos (modelo, escore de anomalia, classe provável e confiança, validação por ensaio,
  matriz de confusão, recall, versão ativa, tendência); `{confianca_min}` vem de `GET /alarmes/limites`.
- **Cor**: a segunda opinião não usa âmbar nem vermelho; a cor de sinal continua só no que a regra pôs em desvio.

**Não feito nesta rodada:** prints (1920 e 390, dois temas), rodada de revisão de design e a execução dos testes
de ponta a ponta (`e2e/ia.spec.ts`, `e2e/acessibilidade-ia.spec.ts`, escritos e ainda não rodados). Conferidos:
tipos, lint e Vitest (147 testes).

## Publicação

O painel é publicado no Render como site estático (`predictspin-painel` no [`render.yaml`](../render.yaml));
o passo a passo está em [`deploy-render.md`](deploy-render.md#publicar-o-painel-web). **Nada foi
publicado nesta parte**: todo o trabalho rodou no compose local.

- **Build:** `cd painel && npm ci && npm run build` (tipos e Vite), pasta publicada `painel/dist`.
  Só reconstrói quando algo em `painel/**` muda (`buildFilter`).
- **Rotas:** `rewrite /* → /index.html`; o roteador resolve a rota no navegador.
- **Cabeçalhos** (render.yaml): `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY`; `Cache-Control: public, max-age=31536000, immutable` em `/assets/*`
  (nome com hash) e `no-cache` no `index.html`.
- **Content-Security-Policy:** escrita numa `<meta>` pelo build (`vite.config.ts`), porque precisa
  da origem de `VITE_API_URL` e o Blueprint não monta cabeçalho a partir de variável:
  `default-src 'self'; script-src 'self' 'sha256-…'` (o script do tema, pelo hash, sem
  `'unsafe-inline'`); `style-src 'self' 'unsafe-inline'` (posições e tamanhos calculados em `style`);
  `font-src 'self' data:` (as faces pequenas vêm embutidas no CSS); `img-src 'self' data: blob:`;
  `connect-src 'self' <origem da API>`; `object-src 'none'; base-uri 'self'; form-action 'self'`.
  `frame-ancestors` não vale em `<meta>`; o `X-Frame-Options: DENY` cobre. O Zod roda sem `eval`
  (`lib/zod-sem-eval.ts`). Um teste (`scripts/galeria-fora-do-build.test.mjs`) confere a política no
  `index.html` gerado, e `scripts/medir-producao.mjs` percorre as telas do build e conta as violações.
- **CI:** o job `painel` do GitHub Actions roda `npm ci`, lint, tipos, Vitest e build. Os testes de
  ponta a ponta precisam do compose (API, banco, simulador) e rodam localmente.
- **Windows:** o `vite.config.ts` fixa a raiz com a letra da unidade maiúscula; com o terminal aberto em
  `c:\` o empacotador via o mesmo arquivo com dois nomes e o React saía duplicado no build (a página
  quebrava com "Cannot read properties of null (reading 'useContext')"). No Linux do Render e da CI
  isso não acontece.

## Estado final e limitações

**Pronto:** leitura (L1, L2, L3, AO VIVO), coleta completa pelo celular, replay, diagnóstico, catálogos,
usuários, alarmes e OS com estado vazio honesto, paleta de comandos, explicações "?", publicação
descrita e verificada no build local.

**Não testado (e por quê):**

- Nada rodou em produção: nenhuma chamada foi feita à API publicada.
- Nenhum ESP32 real: toda medição veio do simulador, marcada como simulada. A fonte **Real** só foi
  vista vazia.
- Nenhum celular real: o fluxo do celular foi testado no Chromium do Playwright com tela de 390×844 e
  toque emulado. A trava de tela acesa durante a gravação (Wake Lock) não foi verificada num aparelho;
  onde o navegador não a oferece, a tela segue sem ela.
- O cenário T3 `avanco_excessivo` do simulador sobe mais o ponto C que o B (a leitura do mapa diz o
  que vê: o ponto C sobe mais); não é medição.

**Pendências para os próximos prompts:**

- Regra de alarme e referência aprendida na API (contrato proposto acima). Até lá, sem cor de estado
  e "SEM REFERÊNCIA".
- Treinar modelo: o botão existe na Coleta, desabilitado, com o motivo.
- Diagnóstico de acionamento × processo depende da classificação, que ainda não começou.
- Comparar pontos num mesmo gráfico (item 4 da direção: tons e estilos de linha por ponto).
