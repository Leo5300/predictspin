# Teste de carga

Data: 10/11/2026, atualizado em 11/11/2026 e em 12/11/2026 (eventos ao vivo). O script [`carga/telemetria.js`](../carga/telemetria.js) usa o
[k6](https://k6.io) para medir a API com ingestão de telemetria e consultas ao mesmo tempo.

**As janelas enviadas pelo teste são simuladas.** Saem do dispositivo `ps-sim-01` com valores
sorteados, ficam gravadas com a marca `simulado` e servem só para medir o servidor. Nunca
substituem medição.

## O que o teste faz

Cada usuário virtual (VU) repete, até o fim do cenário:

1. `POST /api/v1/telemetria` com uma janela nova (3 pontos e 5 canais);
2. uma consulta, alternando entre `GET /maquinas/{id}/ultima-janela`,
   `GET /pontos/{id}/telemetria` e `GET /maquinas/{id}/ensaios`;
3. espera de 1 s (`PAUSA_S`).

| Cenário | VUs | Duração | Início |
|---|---|---|---|
| `vus20` | 20 | 60 s | 0 s |
| `vus50` | 50 | 60 s | 70 s (10 s depois do fim do primeiro) |

Com a pausa de 1 s, cada VU envia perto de uma janela por segundo. O ESP32 envia uma a cada 5 s;
50 VUs equivalem, em volume de ingestão, a cerca de 250 dispositivos.

Metas, conferidas pelo próprio k6 (o comando termina com erro se alguma falhar):

| Meta | Onde vale |
|---|---|
| p95 do tempo de resposta abaixo de 500 ms | total, cada cenário, ingestão e consultas em separado |
| menos de 1% de requisições com erro | total e cada cenário |
| mais de 99% das verificações de status corretas | total |

Antes de medir, o script confere `/actuator/health` (esperando a API acordar, se estiver
hibernada), entra com o usuário informado e descobre a máquina e os pontos. Essas chamadas não
entram nas metas por cenário.

### Limites do teste

- Todos os VUs usam o mesmo dispositivo. Até 10/11 cada ingestão atualizava `ultimo_contato` na
  mesma linha de `DISPOSITIVO`, e as gravações faziam fila nessa linha. A medição e a correção estão
  em [Otimização da ingestão](#otimização-da-ingestão-11112026-antes-e-depois).
- O `medido_em` de cada envio é único (relógio em milissegundos mais o número do VU nos
  microssegundos), para que toda requisição grave uma janela nova. O caminho de reenvio
  (resposta 200) não é exercitado; os contadores `janelas_novas` e `janelas_duplicadas` do resumo
  mostram quantas caíram em cada caso.
- Cada execução completa grava cerca de 4 mil janelas simuladas (uma linha em `JANELA`, 3 em
  `TELEMETRIA` e 5 em `LEITURA` para cada). Não há rota para apagá-las.
- Se houver um ensaio **simulado** aberto na máquina, as janelas do teste entram nele. Encerre ou
  descarte o ensaio antes de rodar.

## Variáveis

Passadas com `-e NOME=valor` ou como variáveis de ambiente.

| Variável | Padrão | Uso |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | endereço da API |
| `DISPOSITIVO_SIM_CHAVE` | obrigatória | chave do dispositivo `ps-sim-01` |
| `ADMIN_EMAIL`, `ADMIN_SENHA` | obrigatórias | usuário ADMIN ou TECNICO, usado nas consultas |
| `DISPOSITIVO` | `ps-sim-01` | identificador do dispositivo |
| `MAQUINA` | `TORNO-01` | máquina consultada |
| `DURACAO_S` | `60` | duração de cada cenário |
| `PAUSA_S` | `1` | espera de cada VU entre iterações |
| `CENARIO` | vazio | `20` ou `50` para rodar um só; vazio roda os dois |

Nenhuma chave ou senha vai no script nem no repositório.

## Como rodar localmente

Suba a API (`docker compose up -d --build`) e espere `/actuator/health` responder.

**Com o k6 instalado** (`winget install k6 --source winget`), no PowerShell, a partir da raiz:

```powershell
k6 run `
  -e BASE_URL=http://localhost:8080 `
  -e DISPOSITIVO_SIM_CHAVE=CHAVE_DO_SIMULADOR `
  -e ADMIN_EMAIL=EMAIL_DO_ADMIN `
  -e ADMIN_SENHA=SENHA_DO_ADMIN `
  carga/telemetria.js
```

**Sem instalar o k6**, pela imagem Docker, na mesma rede do compose (a API responde por `api:8080`):

```powershell
docker run --rm --network predictspin_default `
  -v "${PWD}/carga:/carga:ro" `
  -e BASE_URL=http://api:8080 `
  -e DISPOSITIVO_SIM_CHAVE=CHAVE_DO_SIMULADOR `
  -e ADMIN_EMAIL=EMAIL_DO_ADMIN `
  -e ADMIN_SENHA=SENHA_DO_ADMIN `
  grafana/k6:latest run /carga/telemetria.js
```

Para um ensaio rápido antes do teste completo, acrescente `-e CENARIO=20 -e DURACAO_S=10`. Ele
serve para conferir credenciais e endereço, não para medir: nos primeiros segundos, quando todos os
VUs disparam juntos, as respostas são mais lentas, e num teste curto isso domina o p95. Nas duas
execuções curtas feitas nesta máquina (10 s e 5 s, 20 VUs) o p95 total ficou em 792 ms e 617 ms,
acima da meta, sem nenhum erro.

## Como rodar contra produção

Troque só o endereço:

```powershell
k6 run `
  -e BASE_URL=https://SEU-SERVICO.onrender.com `
  -e DISPOSITIVO_SIM_CHAVE=CHAVE_DO_SIMULADOR `
  -e ADMIN_EMAIL=EMAIL_DO_ADMIN `
  -e ADMIN_SENHA=SENHA_DO_ADMIN `
  carga/telemetria.js
```

Antes de rodar:

- **Não rode durante uma coleta real.** O teste disputa CPU e banco com o ESP32.
- **Comece por `-e CENARIO=20`.** A instância gratuita do Render tem 0,1 CPU e 512 MB; é esperado
  que fique longe da meta com 50 VUs. O resultado mede a instância contratada, não o código.
- **O serviço pode estar hibernado.** O script espera a API responder antes de iniciar os
  cenários, mas os primeiros segundos ainda pegam a JVM fria.
- **O tempo inclui a internet** entre a sua máquina e o Render. Anote de onde rodou.
- **O banco gratuito tem 1 GB.** Cada execução completa acrescenta cerca de 4 mil janelas simuladas.

## Como ler o resultado

No fim, o k6 imprime o bloco `THRESHOLDS` (✓ ou ✗ para cada meta) e o bloco `TOTAL RESULTS`. As
linhas que interessam:

| Linha | Significado |
|---|---|
| `http_req_duration { carga:20vus }` e `{ carga:50vus }` | tempo de resposta em cada cenário; a coluna `p(95)` é a da meta |
| `http_req_duration { tipo:ingestao }` e `{ tipo:consulta }` | o mesmo, separado por tipo de chamada |
| `http_req_failed` | proporção de respostas com erro (4xx e 5xx) ou sem resposta |
| `http_reqs` | total de requisições e taxa por segundo |
| `janelas_novas`, `janelas_duplicadas` | quantas ingestões gravaram janela nova ou caíram no reenvio |

Para guardar o resultado, redirecione a saída para um arquivo em `carga/resultados/` (pasta fora
do controle de versão; crie-a antes):

```powershell
New-Item -ItemType Directory -Force carga/resultados
k6 run ... carga/telemetria.js | Tee-Object carga/resultados/2026-11-10-local.txt
```

## Medição de referência (local)

Única medição feita até agora. Vale para esta máquina e esta configuração; não é previsão para
produção.

- **Data:** 10/11/2026, uma execução completa, commit `d5f201d`.
- **Máquina:** notebook com Intel Core i5-1135G7 (8 processadores lógicos), 7,8 GB de RAM,
  Windows 11, Docker Desktop com 3,7 GB de memória disponível para os contêineres.
- **Montagem:** API e PostgreSQL 16 pelo `docker compose` do repositório, sem limite de memória no
  contêiner da API, `JAVA_OPTS` padrão da imagem e `DB_POOL_MAX=10`. k6 v2.3.0 pela imagem
  `grafana/k6`, **na mesma máquina** e na mesma rede Docker, portanto sem latência de rede e
  disputando CPU com a API e o banco.
- **Estado:** API no ar havia cerca de três minutos, depois de um ensaio de 10 s com 20 VUs; banco
  com poucas centenas de janelas no início.

| Métrica | 20 VUs | 50 VUs | Meta |
|---|---|---|---|
| Requisições | 2 240 | 5 658 | |
| Taxa aproximada (requisições ÷ 60 s) | 37 req/s | 94 req/s | |
| Tempo médio | 36,89 ms | 33,81 ms | |
| Mediana | 15,79 ms | 10,97 ms | |
| p95 | 124,41 ms | 154,55 ms | < 500 ms |
| p99 | 523,55 ms | 461,15 ms | |
| Máximo | 943,03 ms | 1,12 s | |
| Erros | 0 % | 0 % | < 1 % |

| Por tipo de chamada (os dois cenários somados) | Média | p95 | p99 |
|---|---|---|---|
| Ingestão | 51,56 ms | 241,32 ms | 550,97 ms |
| Consultas | 17,81 ms | 56,00 ms | 159,36 ms |

Todas as metas foram atendidas: 7 902 requisições, nenhuma com erro, 3 949 janelas novas e nenhuma
duplicada. A ingestão tem cauda mais longa que as consultas (p99 acima de 500 ms).

Ainda **não medido**: produção no Render, contêiner limitado a 512 MB, banco com volume grande de
dados e execução com o k6 em outra máquina. Esta medição é anterior à otimização de 11/11.

## Otimização da ingestão (11/11/2026): antes e depois

### O que foi medido e onde

- **Máquina:** a mesma da medição de referência (notebook Intel Core i5-1135G7, 7,8 GB, Windows 11,
  Docker Desktop). API e PostgreSQL pelo `docker compose` do repositório, `DB_POOL_MAX=10`,
  `JAVA_OPTS` padrão; k6 v2.3.0 pela imagem `grafana/k6`, na mesma rede Docker.
- **Protocolo, igual nos dois lados:** banco recriado vazio (`docker compose down -v`), API
  reconstruída, aquecimento de 10 s com 20 VUs (`-e CENARIO=20 -e DURACAO_S=10`, descartado) e três
  execuções completas seguidas (20 e 50 VUs, 60 s cada).
- **Antes:** commit `2f75ab4`. **Depois:** o mesmo código com a mudança abaixo.
- **Produção:** não medida. As variáveis de produção não estavam definidas na sessão; o comando
  está em [Como medir em produção](#como-medir-em-produção).

### Onde estava o tempo

Um `POST /api/v1/telemetria` com 3 pontos e 2 canais faz 14 comandos no banco (log do PostgreSQL com
`log_min_duration_statement = 0`, uma requisição isolada):

| Etapa | Comandos | Tempo no banco (requisição isolada) |
|---|---|---|
| autenticação do dispositivo (transação só de leitura) | `BEGIN`, `SELECT` do dispositivo, `COMMIT` | 1,3 ms |
| códigos de pontos e de canais da máquina | 2 `SELECT` | 0,9 ms |
| `UPDATE dispositivo SET ultimo_contato` | 1 | 3,6 ms |
| ensaio aberto | 1 `SELECT` | 0,2 ms |
| janela, 3 telemetrias e 2 leituras | 6 `INSERT` | 6,9 ms |
| `COMMIT` | 1 | 1,1 ms |

Isolada, a requisição é rápida. Sob carga, a amostragem de `pg_stat_activity` a cada 0,2 s
(100 amostras durante 50 VUs) mostrou onde as sessões ativas paravam:

| Estado da sessão ativa | Antes | Depois |
|---|---|---|
| esperando trava (`Lock:transactionid` ou `Lock:tuple`) no `UPDATE dispositivo` | **29 de 51** | **0 de 25** |
| esperando gravação do log (`IO:WALSync`) | 4 | 1 |
| executando (CPU), quase tudo a contagem da consulta paginada de telemetria | 15 | 24 |

Todos os VUs enviam como o mesmo dispositivo (`ps-sim-01`). O `UPDATE` vinha antes dos `INSERT` e
travava a linha do dispositivo até o `COMMIT`. As ingestões concorrentes faziam fila nessa linha,
uma de cada vez. Com um único ESP32 por máquina isso quase não acontece em operação. Mas a mesma
fila se forma sempre que um dispositivo envia em rajada, por exemplo ao esvaziar a fila depois de
uma queda de rede ou da hibernação do Render.

As hipóteses do roteiro foram conferidas e descartadas pelo dado:

- **Hash da chave do dispositivo:** é SHA-256 e não aparece como tempo próprio.
- **Consultas de códigos de pontos e canais:** somam 0,9 ms e nunca apareceram esperando.
- **Pool:** com 10 conexões, nenhuma espera por conexão apareceu nas amostras.

### A mudança

`DISPOSITIVO.ultimo_contato` passa a ser gravado só quando o valor guardado tem mais de 10 s
(`UPDATE ... WHERE id = ? AND (ultimo_contato IS NULL OR ultimo_contato < agora - 10 s)`). Fora
desse intervalo o `UPDATE` não encontra linha e não trava nada. O efeito colateral é a resolução de
10 s no último contato, suficiente para saber se o dispositivo está vivo. Nas execuções do
depois, a tabela `dispositivo` recebeu 41 atualizações em cinco execuções (aquecimento, três completas e diagnóstico), contra uma por janela
(cerca de 4 mil por execução) antes. Testes:
`IngestaoServiceTest.janelaNovaGravaPontosCanaisERegistraContato` e
`IngestaoIntegracaoTest.ultimoContatoRecenteNaoEhRegravadoEAntigoEh`.

### Resultado

**Comando de diagnóstico** (50 VUs por 40 s, com a amostragem de `pg_stat_activity` rodando junto
nos dois lados; é a comparação mais direta, porque mede o mesmo trecho com o mesmo ruído):

| Métrica (ingestão, `POST /telemetria`) | Antes | Depois |
|---|---|---|
| Mediana | 71,75 ms | 6,74 ms |
| p95 | 1,04 s | 25,31 ms |
| p99 | 1,94 s | 229,50 ms |
| Máximo | 2,41 s | 309,54 ms |
| Janelas gravadas em 40 s | 1 535 | 1 958 |
| Erros | 0 % | 0 % |

**Execuções completas** (20 e 50 VUs, 60 s cada; três de cada lado, na ordem em que rodaram):

| Ingestão | Antes 1 | Antes 2 | Antes 3 | Depois 1 | Depois 2 | Depois 3 |
|---|---|---|---|---|---|---|
| Mediana | 14,81 ms | 10,40 ms | 8,16 ms | 9,31 ms | 9,11 ms | 6,38 ms |
| p95 | 1,06 s | 167,36 ms | 106,17 ms | 63,26 ms | 129,21 ms | 20,74 ms |
| p99 | 2,36 s | 764,67 ms | 1,80 s | 859,76 ms | 1,43 s | 225,19 ms |
| Máximo | 5,67 s | 2,00 s | 3,35 s | 2,14 s | 3,41 s | 380,59 ms |

| Total (todas as requisições) | Antes 1 | Antes 2 | Antes 3 | Depois 1 | Depois 2 | Depois 3 |
|---|---|---|---|---|---|---|
| Requisições | 7 128 | 7 938 | 7 924 | 8 084 | 7 820 | 8 282 |
| p95 | 372,51 ms | 107,53 ms | 58,12 ms | 41,14 ms | 88,98 ms | 27,71 ms |
| p99 | 1,96 s | 468,94 ms | 439,42 ms | 330,02 ms | 472,39 ms | 83,01 ms |
| Erros | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % |
| Metas atendidas | não (p95 da ingestão) | sim | sim | sim | sim | sim |

Leitura dos números:

- A mediana dos três p95 da ingestão caiu de 167 ms para 63 ms, e a dos três p99 de 1,80 s para
  860 ms. A espera por trava, que era a causa medida, desapareceu.
- As execuções completas oscilam muito entre si nos dois lados. Picos isolados de 1 a 5 s
  aparecem antes e depois da mudança, em consultas e em ingestões, e não coincidiram com espera no
  banco. A causa não foi investigada; a suspeita, não verificada, é a máquina virtual do Docker
  Desktop disputando CPU com o Windows.
- A primeira execução de cada lado, logo depois do aquecimento, foi a pior. Dez segundos de
  aquecimento não bastam para a JVM chegar ao regime.
- A montagem é a mesma da referência de 10/11, mas as execuções de 11/11 antes da mudança saíram
  diferentes dela (p95 da ingestão de 106 ms a 1,06 s, contra 241 ms em 10/11). Uma execução
  isolada nesta máquina não basta para comparar.

Saídas completas em `carga/resultados/2026-11-11-local-*.txt` (fora do controle de versão).

## Eventos ao vivo e ingestão (12/11/2026)

A pergunta: clientes conectados ao fluxo de eventos ao vivo (SSE, `GET /maquinas/{id}/eventos`)
atrasam a ingestão? Cada janela gravada passa a ser lida do banco e escrita para cada cliente, em
threads próprias (ver [`arquitetura.md`](arquitetura.md#eventos-ao-vivo-sse)).

### O que foi medido e onde

- **Máquina e montagem:** as mesmas das medições anteriores (notebook Intel Core i5-1135G7,
  7,8 GB, Windows 11, Docker Desktop; API e PostgreSQL pelo `docker compose`, `DB_POOL_MAX=10`,
  `JAVA_OPTS` padrão; k6 v2.3.0 pela imagem `grafana/k6`, na mesma rede Docker). API construída a
  partir do código do commit que introduz os eventos ao vivo. **Produção não foi medida.**
- **Estado:** banco com alguns milhares de janelas simuladas (não foi recriado); o simulador
  contínuo ficou ligado o tempo todo (uma janela a cada 5 s).
- **Protocolo:** aquecimento de 10 s com 20 VUs (descartado) e, em seguida, três pares de execuções
  de 60 s com 20 VUs (`-e CENARIO=20`), alternando: sem cliente de eventos, depois com 3 clientes.
  Os clientes eram três conexões HTTP mantidas por um script Python na mesma máquina, fora do
  Docker, autenticadas como ADMIN, lendo o fluxo sem filtro.

### Resultado

| Ingestão (`POST /telemetria`), 20 VUs | Sem 1 | Sem 2 | Sem 3 | Com 3 SSE, 1 | Com 3 SSE, 2 | Com 3 SSE, 3 |
|---|---|---|---|---|---|---|
| Mediana | 11,21 ms | 8,36 ms | 7,64 ms | 8,74 ms | 7,70 ms | 7,52 ms |
| p95 | 29,46 ms | 30,35 ms | 18,71 ms | 23,31 ms | 16,01 ms | 17,63 ms |
| p99 | 185,22 ms | 74,04 ms | 49,70 ms | 69,80 ms | 85,04 ms | 65,83 ms |
| Máximo | 248,04 ms | 113,82 ms | 96,48 ms | 144,15 ms | 297,84 ms | 88,79 ms |
| Janelas gravadas pelo k6 | 1 180 | 1 180 | 1 180 | 1 180 | 1 180 | 1 180 |
| Erros | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % |

| Consultas, 20 VUs | Sem 1 | Sem 2 | Sem 3 | Com 3 SSE, 1 | Com 3 SSE, 2 | Com 3 SSE, 3 |
|---|---|---|---|---|---|---|
| p95 | 19,51 ms | 22,10 ms | 19,75 ms | 16,67 ms | 16,26 ms | 21,38 ms |

Em cada execução com clientes, cada um dos três recebeu 1 195 eventos `janela` em 72 s de conexão
(as 1 180 janelas do k6 mais as do simulador contínuo): nenhum evento foi descartado e nenhum
cliente foi desconectado.

Leitura dos números:

- O p95 da ingestão com 3 clientes de eventos (16 a 23 ms) ficou dentro da faixa das execuções sem
  cliente (19 a 30 ms). **Não houve piora visível.** A ordem das execuções (sem, com, sem, com…)
  favorece um pouco o lado "com", que roda sempre com a JVM mais aquecida; a primeira execução sem
  cliente foi a pior das seis, como nas medições de 11/11.
- Comparação com o registrado em 11/11 depois da otimização: nas execuções completas (20 e
  50 VUs somados) o p95 da ingestão foi de 63, 129 e 21 ms; no diagnóstico com 50 VUs, 25 ms. As
  seis execuções de hoje, só com 20 VUs, ficaram entre 16 e 30 ms. Os cenários não são idênticos
  (hoje não houve a fase de 50 VUs), então a comparação serve para ordem de grandeza.
- A cauda (p99 e máximo) oscila nos dois lados, como já oscilava.

Saídas completas em `carga/resultados/2026-11-12-sse-*.txt` (fora do controle de versão).

Ainda **não medido**: mais de 3 clientes, cliente lento de verdade (rede ruim) e a instância de
0,1 CPU do Render. O comportamento com cliente lento é coberto por teste automatizado
(`EventosServiceTest.clienteLentoEhDescartadoSemSegurarQuemPublica`), não por medição.

## Ingestão com a avaliação contra a referência (18/11/2026)

Medido nesta máquina (Windows, compose local, simulador `ps-sim-01`, banco com o histórico dos testes do
dia e referência ativa), 20 VUs, mesmo método da seção de 11/11: API reconstruída, aquecimento de 10 s
descartado e execuções de 60 s (`-e CENARIO=20 -e DURACAO_S=60`). Desde a parte A, cada janela recebida é
avaliada contra a referência (estado de cada ponto, alerta e OS) antes da resposta.

| Execução | Requisições | Erros | p95 total | p95 da ingestão |
|---|---|---|---|---|
| avaliação no afterCommit da ingestão (versão descartada) | 84 | 23,8% | 30,51 s | (pedidos parados até o prazo de 30 s) |
| avaliação depois da ingestão, 1ª | 1638 | 0% | 1,33 s | 1,94 s |
| avaliação depois da ingestão, 2ª | 1944 | 0% | 544,71 ms | 852,23 ms |
| avaliação depois da ingestão, 3ª (com amostragem do banco) | — | 0% | 524,22 ms | 672,66 ms |

- A meta de p95 abaixo de 500 ms **não é atendida** pela ingestão depois da parte A (antes dela, a mediana
  dos p95 da ingestão nesta máquina era 63 ms).
- Na 3ª execução, 30 amostras de `pg_stat_activity` (uma por segundo) não mostraram espera de trava
  (`Lock`); apareceram só `Client:ClientRead` e CPU. A causa do tempo a mais não foi isolada; a hipótese
  da trava em `estado_ponto` (`SELECT ... FOR UPDATE`, as 20 VUs usam o mesmo dispositivo e os mesmos
  pontos) não foi confirmada nesta medição.
- O cenário é mais pesado que o uso real: um ESP32 manda uma janela a cada 5 s, em série; aqui 20 VUs
  mandam janelas do mesmo dispositivo ao mesmo tempo.

## Avaliação fora do caminho da resposta (19/11/2026)

Medido nesta máquina (Windows, Docker Desktop com 8 CPUs e 4 GB, compose local, API sem limite de memória e
`JAVA_OPTS` padrão da imagem, pool de 10), mesmo método: k6 pela imagem `grafana/k6` na rede do compose,
`-e CENARIO=20`, aquecimento de 10 s descartado e execuções de 60 s. Para toda janela do k6 ser avaliada, a
referência simulada foi gravada antes em todas as marchas da faixa sorteada pelo script (380 a 1250 rpm):
roteiro T0, T1 e T3 normais a 355, 450, 560, 710, 900 e 1120 rpm, 30 janelas cada (versão 3, 306 células).

**Medição antes (código de de9782f).** Instrumentação temporária (retirada antes do commit) mediu, em cada POST, o
tempo de gravar (transação da ingestão), o de avaliar (estado, alerta e OS, ainda na thread do pedido), a espera
pela trava de `estado_ponto` dentro da avaliação e o pool de conexões (Hikari) no fim da avaliação. Uma janela
normal custa 28 comandos SQL (log do PostgreSQL com `log_statement = all`, uma janela): 17 da ingestão, 9 da
avaliação (trava, 3 avaliações, 3 estados) e 2 da autenticação do dispositivo.

| Execução (20 VUs, 60 s) | p95 ingestão | p99 ingestão | gravar p95 | avaliar p95 | trava p95 / p99 | pool no pico |
|---|---|---|---|---|---|---|
| antes, máquina livre (1 146 janelas) | 152,0 ms | 323,7 ms | 49,3 ms | 40,5 ms | 20,6 / 89,2 ms | 10 ativas, 10 threads esperando |
| antes, 8 laços de CPU em paralelo (1 095 janelas) | 227,4 ms | 451,6 ms | 77,7 ms | 69,9 ms | 43,7 / 178,8 ms | 10 ativas, 10 threads esperando |

Execuções antes, sem instrumentação: p95 da ingestão 86,7 ms e 150,2 ms (p99 1,44 s na segunda). Os
673 ms a 1,94 s de 18/11 não se repetiram; a hipótese mais provável é a máquina carregada pelos testes que
rodavam em paralelo naquele dia, mas isso não foi provado.

**Causa.** A avaliação ficava no caminho da resposta (cerca de metade do tempo), as avaliações da mesma
máquina esperavam umas pelas outras na trava de `estado_ponto` e, nos picos, o pool ficava cheio e as threads
da ingestão esperavam conexão. Com a máquina carregada, quem segura a trava perde a CPU e a fila cresce.

**Correção.** A avaliação saiu da resposta para a `FilaDeAvaliacao` (uma thread por máquina e tipo de dado, fila
de 64, ordem preservada, erro isolado e contado; ver [`alarmes.md`](alarmes.md#visão-geral)). Uma avaliação
por máquina de cada vez: não há mais disputa pela trava nem segunda conexão por pedido.

**Depois (correção de 20/11/2026).** A primeira medição "depois" (19/11) saiu **enviesada** e foi descartada: o
script do k6 não mandava `calibracao`, e com a regra nova de calibração (só compara quando janela e referência
têm a mesma) as janelas do k6 ficaram "calibração diferente" da referência simulada, sem cálculo de z (12 429
avaliações nessa situação no banco). A avaliação ficou mais leve que no "antes", e os números não serviam para
comparar. O script passou a mandar a mesma rastreabilidade do simulador (`firmware_versao`, `calibracao`,
`eixos`) e a velocidade estimada das ordens; as janelas voltaram a ser avaliadas por inteiro.

Medido de novo em 20/11/2026, mesmo método (compose padrão, pool de 10, sem modelo ativo, imagem com o código
da IA parte B), 20 VUs por 60 s:

| Execução depois (20 VUs, 60 s) | Erros | p95 ingestão | p99 ingestão |
|---|---|---|---|
| 1ª, logo depois de reiniciar a API (houve uma parada de cerca de 10 s) | 0% | 1,16 s | 2,51 s |
| 2ª | 0% | 1,15 s | 1,78 s |
| 3ª | 0% | 230,8 ms | 926,0 ms |
| 4ª | 0% | 203,7 ms | 416,2 ms |
| 5ª | 0% | 398,1 ms | 4,68 s |
| 6ª (com amostragem do banco) | 0% | 295,8 ms | 702,5 ms |

Nenhuma janela foi descartada da fila e nenhuma ficou sem avaliação. Nesta máquina, **o p95 sob estresse não
melhorou** em relação ao "antes" (86,7 a 227,4 ms). As paradas não vêm do banco: 110 amostras do
`pg_stat_activity` (a cada 0,4 s, na 6ª execução) não mostraram nenhuma consulta acima de 300 ms. Com as opções
de JVM da produção (512 MB, `-Xmx220m`, `-XX:ReservedCodeCacheSize=48m`, SerialGC) e o log do GC ligado, uma
execução de 20 VUs teve 17 pausas completas "CodeCache GC Threshold" de até 4,9 s: o cache de código de 48 MB
enche sob carga e força coletas completas, que param tudo. Por isso o `render.yaml` passou a reservar 96 MB de
cache de código (só ocupa memória o que a JVM compilar).

**Escopo.** Os cenários de 20 e 50 usuários são de **estresse**: o uso real é 1 ESP32 mandando uma janela a cada
5 s e até 4 pessoas no painel. Esse cenário realista foi medido uma vez, com o modelo ativo, na etapa 4.7 da IA
parte B (seção seguinte). Por decisão do projeto, não foram feitas mais rodadas de estresse só para reduzir a
variação do p95.

## Cenário realista com o modelo ativo (IA parte B, 4.7, 20/11/2026)

O uso real é 1 ESP32 mandando uma janela a cada 5 s e até 4 pessoas no painel. `CENARIO=realista` no
`carga/telemetria.js`: 1 VU manda uma janela a cada 5 s (1120 rpm) e 4 VUs fazem uma consulta a cada 5 s. Uma
execução de 300 s, no compose local, API com limite de 512 MB e as opções de JVM da produção (com o cache de código
de 96 MB), pool de 5 conexões e o modelo de fixture ativo (ONNX Runtime):

| Medida | Resultado |
|---|---|
| Requisições / erros | 282 / 0% |
| Ingestão: p95, p99, máx. | 1,50 s, 5,38 s, 6,48 s |
| Consultas: p95, p99, máx. | 1,47 s, 6,05 s, 6,80 s |
| Memória do contêiner (RSS máx. / anônima máx. / cgroup máx.) | 431,3 / 389,1 / 448,9 MiB |
| Janelas gravadas com segunda opinião (contado no banco) | 54 de 54 |

A meta de 500 ms de p95 **não foi atendida** neste cenário, mesmo com carga leve; com a memória do contêiner perto
do limite, a hipótese é a pressão de memória, não confirmada. Não foram feitas outras rodadas (decisão do
projeto). Detalhes e a decisão ONNX × Java em [`ia.md`](ia.md#onnx--java-memória-medida).

### Como medir em produção

Para ter o antes em produção, rode **antes do push** que leva esta mudança ao Render; depois do
push e do redeploy, rode de novo para o depois. No PowerShell, a partir da raiz do repositório, com
`$env:PS_URL`, `$env:DISPOSITIVO_SIM_CHAVE`, `$env:ADMIN_EMAIL` e `$env:ADMIN_SENHA` definidas na
mesma janela:

```powershell
# 1. acorda a API e mede quanto levou
$t = Measure-Command { do { try { $ok = (Invoke-WebRequest "$env:PS_URL/actuator/health" -UseBasicParsing -TimeoutSec 30).StatusCode -eq 200 } catch { $ok = $false; Start-Sleep 5 } } until ($ok) }
"API respondeu depois de $([int]$t.TotalSeconds) s"

# 2. latência de rede: mediana de 10 GETs no health
$ms = 1..10 | ForEach-Object { (Measure-Command { Invoke-WebRequest "$env:PS_URL/actuator/health" -UseBasicParsing | Out-Null }).TotalMilliseconds } | Sort-Object
"mediana do health: $([int](($ms[4] + $ms[5]) / 2)) ms"

# 3. carga com 20 VUs (50 VUs só se o de 20 passar: troque CENARIO=20 por CENARIO=50)
New-Item -ItemType Directory -Force carga/resultados | Out-Null
docker run --rm -v "${PWD}/carga:/carga:ro" `
  -e BASE_URL=$env:PS_URL -e DISPOSITIVO_SIM_CHAVE -e ADMIN_EMAIL -e ADMIN_SENHA -e CENARIO=20 `
  grafana/k6:latest run --no-color /carga/telemetria.js | Tee-Object carga/resultados/producao-depois.txt
```

Antes do passo 3, confira que não há ensaio simulado aberto (`GET /api/v1/maquinas/{id}/ensaios`,
campo `aberto`). Registre o tempo para acordar, a mediana do health e as linhas
`{ tipo:ingestao }` e `{ carga:20vus }`.

| Produção (Render, plano gratuito) | Antes | Depois |
|---|---|---|
| Data e hora | | |
| Commit da API | | |
| Tempo até o primeiro health responder | | |
| Mediana de 10 GETs no health | | |
| 20 VUs: requisições | | |
| 20 VUs: p95 | | |
| 20 VUs: erros | | |
| Ingestão: p95 | | |
| Ingestão: p99 | | |
| Metas atendidas (sim ou não) | | |
