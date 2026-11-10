# Teste de carga

Data: 10/11/2026. O script [`carga/telemetria.js`](../carga/telemetria.js) usa o
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

- Todos os VUs usam o mesmo dispositivo. Cada ingestão atualiza `ultimo_contato` na mesma linha de
  `DISPOSITIVO`, então as gravações concorrem entre si mais do que concorreriam com dispositivos
  distintos. O efeito disso na cauda da ingestão não foi medido em separado.
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
dados e execução com o k6 em outra máquina.

## Antes e depois (para preencher)

Use quando mudar algo que possa afetar o desempenho (índice, tamanho do pool, plano do Render,
versão da API). Rode o mesmo comando antes e depois, na mesma máquina e com o banco em estado
parecido, e registre só o que foi medido.

| | Antes | Depois |
|---|---|---|
| Data e hora | | |
| Commit da API | | |
| Ambiente (local ou produção, plano) | | |
| Máquina que rodou o k6 | | |
| O que mudou | | |

| Métrica | Antes | Depois | Meta |
|---|---|---|---|
| 20 VUs: requisições | | | |
| 20 VUs: p95 | | | < 500 ms |
| 20 VUs: p99 | | | |
| 20 VUs: erros | | | < 1 % |
| 50 VUs: requisições | | | |
| 50 VUs: p95 | | | < 500 ms |
| 50 VUs: p99 | | | |
| 50 VUs: erros | | | < 1 % |
| Ingestão: p95 | | | < 500 ms |
| Consultas: p95 | | | < 500 ms |
| Metas atendidas (sim ou não) | | | |

Observações:
