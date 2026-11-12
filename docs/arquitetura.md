# Arquitetura — v3

Data: 10/11/2026, atualizada em 11/11/2026 (firmware de 3 sensores e modo rápido) e em 12/11/2026
(consultas do painel, eventos ao vivo e plano de coleta) · Versão 3 ·
telemetria agrupada em janela (ver [`der.md`](der.md)), autenticação de dispositivo por cabeçalho e
coleta rotulada por ensaio. A v2 (18/09/2026) corrigiu ESP32-S3
(inexistente no acervo) e sensores descartados (MLX90614, INMP441, BME280).

## Visão geral

```mermaid
flowchart LR
    subgraph campo[Chão de fábrica]
        S[Sensores<br/>3x ADXL345 · sensor óptico de rotação<br/>sensor de corrente · DS18B20]
    end
    subgraph borda[Borda]
        E[ESP32<br/>aquisição sincronizada<br/>RMS · pico · curtose · ordens 1X 2X 3X]
    end
    subgraph aplicacao[Aplicação]
        API[Spring Boot<br/>segurança · regras · classificação]
        DB[(PostgreSQL)]
    end
    subgraph consumo[Consumo]
        APP[React Native<br/>operador e técnico]
        CCO[Painel do CCO]
        OS[Ordem de serviço]
    end
    PY[Python<br/>FFT · PSD · coerência]

    S -->|SPI| E
    E -->|serial/Wi-Fi, sinal bruto| PY
    E -->|HTTPS/TLS · 240 B a cada 5 s| API
    API --- DB
    API --> APP
    API --> CCO
    API --> OS
```

## Camadas e responsabilidades

| Nível | Componente | Responsabilidade |
|---|---|---|
| 1 | Sensores | Medir. Nada além disso. |
| 2 | ESP32 | Amostrar em tempo determinístico, extrair características, transmitir |
| 3 | Enlace | Wi-Fi com TLS; buffer local cobre a queda de rede |
| 4 | Spring Boot + PostgreSQL | Autenticar, validar, comparar com baseline, classificar, abrir ordem |
| 5 | React Native e painel web | Apresentar condição e conduzir a ação |

Em operação, o dispositivo não envia forma de onda: transmite cerca de 500 bytes de JSON a cada
5 segundos, com as características já extraídas. No modo rápido, pedido por um usuário para ver a
máquina ao vivo, a janela cai para 1 s por 2 minutos. Durante ensaio, o sinal bruto vai pela serial
(quadros binários) para um notebook, sem depender de microSD ou RTC: nenhum dos dois consta no
acervo do laboratório.

## Firmware

Escrito em 11/11/2026 para 3 ADXL345 e o FC-51 num ESP32 DOIT DevKit V1; detalhes em
[`firmware.md`](firmware.md). **Compila e passa nos testes nativos, mas ainda não foi testado em
hardware.**

- **Núcleo 1, aquisição:** a cada 2 ms esvazia as FIFO dos três sensores (ODR 1600 Hz) no mesmo
  tick. Calcula em fluxo RMS, pico, curtose e as ordens por Goertzel com janela de Hann.
- **Núcleo 0, rede e interface:** Wi-Fi, NTP, a fila (RAM e LittleFS, 5 h 25 min sem rede), o
  HTTPS com verificação de certificado, a tela e os LEDs.

A aquisição nunca espera a rede.

## Organização do backend

Camadas Controller / Service / Repository, com pacotes por domínio e não por tipo técnico:

```
br.senai.predictspin
├── comum          tratamento global de exceções, respostas padronizadas, paginação
├── config         OpenAPI, CORS, Jackson, Flyway
├── seguranca      JWT, BCrypt, autenticação de dispositivo, rate limiting
├── maquina        local, máquina, ponto de medição, componente, dispositivo
├── telemetria     ingestão, consulta (janelas completas, série agregada), baseline, ensaio
├── eventos        eventos ao vivo para o painel (SSE)
├── alerta         avaliação contra baseline, classificação, severidade acumulada
└── ordemservico   abertura automática, atribuição, ciclo de vida
```

Regra: `Controller` não conhece entidade, só DTO. `Service` concentra regra de negócio e é onde os
testes unitários batem. `Repository` não contém lógica.

## Fluxo da ingestão até a ordem de serviço

```mermaid
sequenceDiagram
    participant D as ESP32
    participant A as API
    participant B as Baseline
    participant O as Ordem de serviço
    D->>A: POST /api/v1/telemetria (credencial do dispositivo)
    A->>A: valida cabeçalhos X-Dispositivo-Id e X-Dispositivo-Chave
    A->>A: valida payload e atualiza ultimo_contato
    alt (dispositivo, medido_em) já recebido
        A-->>D: 200, janela existente (nada é duplicado)
    else janela nova
        A->>A: grava JANELA (com o ensaio aberto, se houver), TELEMETRIA por ponto e LEITURA por canal
        A->>B: compara métricas com baseline da condição (etapa futura)
        opt desvio acima do critério (etapa futura)
            A->>A: classifica tipo de falha e atualiza severidade
            A->>O: abre ordem com máquina, falha, severidade e peça sugerida
        end
        A-->>D: 201, janela criada
    end
```

Hoje a API grava a janela e responde; a comparação com baseline, a classificação e a abertura de
ordem de serviço ainda não estão implementadas (tabelas `BASELINE`, `ALERTA` e `ORDEM_SERVICO` já
existem). O contrato do payload está em [`payload.md`](payload.md). A resposta da ingestão também é
o canal de volta para o dispositivo: enquanto a máquina estiver em modo rápido, ela traz
`modo_rapido_ate`.

A máquina nunca é bloqueada. O sistema classifica e notifica; a decisão permanece com o operador —
restrição explícita da GEOSOL e fundamento da leitura de Indústria 5.0 do projeto.

## Decisões estruturais

**Modelos de IA rodam no servidor, sobre características já extraídas na borda.** Permite iterar
sobre o modelo sem refazer firmware e mantém o dispositivo dedicado a amostrar em tempo
determinístico. Inferência embarcada fica registrada como evolução futura.

**Autenticação de dispositivo é separada da autenticação de usuário.** Telemetria forjada não causa
erro de exibição: causa decisão de manutenção errada, com custo real. Cada unidade tem credencial
própria, provisionada fora do código-fonte, e a API rejeita origem não reconhecida.

**Idempotência na ingestão.** O buffer local pode reenviar. A chave `(dispositivo_id, medido_em)` é
única na tabela `JANELA`; o reenvio responde 2xx e não duplica janela, telemetria nem leitura.

**Coleta rotulada por ensaio.** Um técnico abre um ensaio (etapa, condição, rotação alvo) na
máquina; toda janela recebida enquanto ele está aberto é gravada com esse ensaio. Só há um ensaio
aberto por máquina. Ensaio descartado é marcado, não apagado. A exportação em CSV (uma linha por
janela e ponto, com os rótulos) é o conjunto de treino da classificação. Cada linha diz o `uso`:

- `treino`: as condições de rótulo;
- `validacao`: `sensor_solto`, para conferir o alerta de instrumento, nunca como classe de treino.

A `marca` tira do treino as janelas do modo rápido e as que chegaram com menos de 98% das amostras.

**Modo rápido no banco, não em memória.** O prazo fica em `MAQUINA.modo_rapido_ate`: vale para
todos os dispositivos da máquina e sobrevive a um reinício da API. O dispositivo descobre o modo
pela resposta da ingestão, sem conexão permanente. O painel é avisado pelo evento `modo_rapido` do
fluxo de eventos ao vivo.

**Último contato com resolução de 10 s.** Gravar `DISPOSITIVO.ultimo_contato` em toda janela fazia
as ingestões concorrentes do mesmo dispositivo esperarem umas pelas outras pela trava da linha
(medição em [`teste-de-carga.md`](teste-de-carga.md)). Agora só se grava quando o valor guardado
tem mais de 10 s.

**Plano de coleta na máquina.** `MAQUINA.rotacoes_nominais_rpm` guarda as rotações que a máquina
oferece e `MAQUINA.rotacoes_coleta_rpm` as escolhidas para a grade de cobertura
(`PUT /maquinas/{id}/coleta/plano`). A cobertura usa o plano quando a consulta não informa
rotações; com o plano vazio, continua usando as rotações dos ensaios já feitos.

**Dado simulado é marcado como tal.** Dispositivo e ensaio têm a coluna `simulado`; o simulador
(`analise/simulador.py`) usa o dispositivo `ps-sim-01`. Consultas e exportação filtram por
`simulado`, e janela de dispositivo simulado nunca entra em ensaio real (nem o contrário).

## Consultas do painel

Além da última janela e da série por ponto, o painel usa:

- **Janelas completas** (`GET /maquinas/{id}/janelas` e `GET /ensaios/{id}/janelas`): cada item traz
  o envio, os pontos e os canais. Uma página custa um número fixo de consultas (janelas, contagem,
  telemetrias de todas elas e leituras de todas elas), conferido por teste com as estatísticas do
  Hibernate.
- **Série agregada** (`GET /maquinas/{id}/serie`): o período é dividido em N intervalos iguais (até
  600) e o banco devolve, em uma consulta, média e máximo de `rms_g`, máximo de `pico_g`, média de
  curtose e das ordens por ponto, mais rotação média, número de janelas e saturação por intervalo.
  Janelas do modo rápido ficam fora. Intervalo sem janela volta vazio: é uma lacuna, nunca um valor
  interpolado. O período máximo é de 31 dias, para proteger a instância pequena de produção.

## Eventos ao vivo (SSE)

`GET /api/v1/maquinas/{id}/eventos` devolve um fluxo `text/event-stream`. O usuário se autentica
com o JWT no cabeçalho `Authorization`; token na URL é recusado (401). O parâmetro opcional
`simulado` restringe o fluxo a dado simulado ou real.

| Evento | Corpo | Quando |
|---|---|---|
| `janela` | `JanelaResposta` (o item das listagens de janelas) | janela nova gravada; reenvio (200) não gera evento |
| `ensaio` | `EnsaioEvento` (`acao`: `aberto`, `encerrado` ou `descartado`; `ensaio`: `EnsaioResposta`) | só para ADMIN e TECNICO |
| `modo_rapido` | `ModoRapidoResposta` | modo rápido ligado ou desligado; é também o primeiro evento de toda conexão, com o estado atual |

```mermaid
sequenceDiagram
    participant D as Dispositivo
    participant I as Ingestão (thread da requisição)
    participant F as Difusão (thread própria)
    participant C as Painel (uma thread de envio por cliente)
    D->>I: POST /telemetria
    I->>I: grava a janela e faz o COMMIT
    I-)F: depois do commit: enfileira o id da janela (fila limitada, sem esperar)
    I-->>D: 201
    F->>F: lê a janela completa e serializa uma vez
    F-)C: oferece à fila de cada cliente
    C->>C: escreve no fluxo, ou manda o batimento no silêncio
```

Regras do fluxo:

- **A ingestão nunca espera cliente.** O serviço só anuncia a janela nova; o anúncio é entregue
  depois do commit e apenas coloca o id numa fila limitada (256). Ler a janela do banco e escrever
  para os clientes acontece em outras threads. Sem cliente conectado na máquina, nada é feito.
- **Cliente lento ou caído é descartado.** Cada cliente tem uma fila de 64 mensagens; fila cheia ou
  falha de escrita encerra a conexão dele e libera a vaga.
- **Batimento.** Sem evento por 15 s, vai uma linha de comentário (`:batimento`), para o proxy não
  fechar a conexão. Os cabeçalhos `Cache-Control: no-cache` e `X-Accel-Buffering: no` impedem o
  proxy de segurar o fluxo.
- **Limites.** No máximo 4 conexões por usuário (429) e 20 no total (503), com `Retry-After` e a
  mensagem em `ErroResposta`. Cada conexão custa uma thread de envio; os padrões foram escolhidos
  para a instância de 0,1 CPU e 512 MB e mudam por `EVENTOS_MAX_POR_USUARIO` e `EVENTOS_MAX_TOTAL`.
- **Duração.** O servidor encerra cada conexão depois de 30 minutos; o cliente reconecta. No
  desligamento da API os fluxos são fechados antes da espera pelas requisições em andamento.
- **Uma instância só.** A difusão é em memória: com mais de uma instância da API, um cliente só
  veria os eventos da instância em que está conectado. Enquanto a API rodar em uma instância (como
  no Render hoje), isso basta; para escalar, a difusão teria de passar por um canal compartilhado
  (por exemplo `LISTEN/NOTIFY` do PostgreSQL).

O efeito dos clientes de eventos sobre a ingestão foi medido; os números estão em
[`teste-de-carga.md`](teste-de-carga.md#eventos-ao-vivo-e-ingestão-12112026).

## Ambiente

Docker Compose para banco e API no desenvolvimento. A publicação é feita no Render a partir do
`render.yaml` da raiz (serviço web em Docker e PostgreSQL gerenciado); o passo a passo está em
[`deploy-render.md`](deploy-render.md). A cada push e pull request o GitHub Actions compila a API,
roda os testes com a meta de cobertura e os testes de `analise/`. Manifests Kubernetes para a
demonstração de implantação reproduzível ainda não existem no repositório. Variáveis sensíveis por
ambiente, nunca no repositório.
