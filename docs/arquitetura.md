# Arquitetura — v2

Data: 18/09/2026 · Versão 2 · corrige ESP32-S3 (inexistente no acervo) e sensores descartados (MLX90614, INMP441, BME280)

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
    A->>A: valida credencial e origem
    A->>A: persiste medição
    A->>B: compara métricas com baseline da condição
    alt desvio acima do critério
        A->>A: classifica tipo de falha e atualiza severidade
        A->>O: abre ordem com máquina, falha, severidade e peça sugerida
        A-->>D: 202 aceito, alerta gerado
    else dentro da faixa
        A-->>D: 202 aceito
    end
```

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
única; reenvio não duplica série temporal.

## Ambiente

Docker Compose para banco e API. Manifests Kubernetes versionados no repositório para a
demonstração de implantação reproduzível. Variáveis sensíveis por ambiente, nunca no repositório.
