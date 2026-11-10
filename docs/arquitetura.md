# Arquitetura — v3

Data: 10/11/2026 · Versão 3 · telemetria agrupada em janela (ver [`der.md`](der.md)), autenticação
de dispositivo por cabeçalho e coleta rotulada por ensaio. A v2 (18/09/2026) corrigiu ESP32-S3
(inexistente no acervo) e sensores descartados (MLX90614, INMP441, BME280).

## Visão geral

```mermaid
flowchart LR
    subgraph campo[Chão de fábrica]
        S[Sensores<br/>3x ADXL345 · sensor óptico de rotação<br/>sensor de corrente · DS18B20]
    end
    subgraph borda[Borda]
        E[ESP32<br/>aquisição sincronizada<br/>RMS · FFT/Hann · ordens 1X 2X 3X]
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

Em operação, o dispositivo não envia forma de onda: transmite cerca de 240 bytes a cada 5
segundos, com as características já extraídas. Durante ensaio, o sinal bruto é despachado por
serial ou Wi-Fi direto para um notebook, sem depender de microSD ou RTC — nenhum dos dois consta
no acervo do laboratório.

## Organização do backend

Camadas Controller / Service / Repository, com pacotes por domínio e não por tipo técnico:

```
br.senai.predictspin
├── comum          tratamento global de exceções, respostas padronizadas, paginação
├── config         OpenAPI, CORS, Jackson, Flyway
├── seguranca      JWT, BCrypt, autenticação de dispositivo, rate limiting
├── maquina        local, máquina, ponto de medição, componente, dispositivo
├── telemetria     ingestão, consulta, baseline, ensaio
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
existem). O contrato do payload está em [`payload.md`](payload.md).

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
janela e ponto, com os rótulos) é o conjunto de treino da classificação.

**Dado simulado é marcado como tal.** Dispositivo e ensaio têm a coluna `simulado`; o simulador
(`analise/simulador.py`) usa o dispositivo `ps-sim-01`. Consultas e exportação filtram por
`simulado`, e janela de dispositivo simulado nunca entra em ensaio real (nem o contrário).

## Ambiente

Docker Compose para banco e API. Manifests Kubernetes versionados no repositório para a
demonstração de implantação reproduzível. Variáveis sensíveis por ambiente, nunca no repositório.
