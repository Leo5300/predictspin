# Teste de carga

Data: 10/11/2026, atualizado em 11/11/2026. O script [`carga/telemetria.js`](../carga/telemetria.js) usa o
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
