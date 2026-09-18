# Modelo de dados — DER v2

Data: 18/09/2026 · Versão 2 · PostgreSQL 16

## O que mudou da v1 para a v2

A v1 modelava o domínio em torno de uma única classe de ativo (sonda de perfuração), com três
colunas fixas de vibração (`vib_motor`, `vib_ferramenta`, `vib_base`) presas à tabela de
telemetria. O escopo do projeto passou a cobrir qualquer máquina rotativa industrial — torno,
furadeira, fresadora, CNC, sonda — cada uma com seu próprio arranjo de sensores. Colunas fixas não
sobrevivem a essa mudança: uma fresadora tem pontos de medição que uma furadeira não tem, e o
número de pontos varia por classe de máquina.

A v2 resolve isso com duas entidades novas — `MAQUINA`, que generaliza `SONDA`, e
`PONTO_MEDICAO`, que substitui as três colunas fixas por uma tabela. Cada ponto carrega um papel
fixo (`acionamento`, `ferramenta` ou `estrutura`) — o que generaliza entre máquinas — e uma
posição física própria — o que muda de máquina para máquina. A telemetria referencia o ponto de
medição, não mais a sonda diretamente.

## Diagrama

```mermaid
erDiagram
    LOCAL ||--o{ MAQUINA : abriga
    MAQUINA ||--o{ COMPONENTE : possui
    MAQUINA ||--o{ PONTO_MEDICAO : instrumentada_em
    MAQUINA ||--o{ DISPOSITIVO : monitorada_por
    MAQUINA ||--o{ ENSAIO : submetida_a
    MAQUINA ||--o{ ALERTA : dispara
    MAQUINA ||--o{ SEVERIDADE_ACUMULADA : acumula
    PONTO_MEDICAO ||--o{ TELEMETRIA : origina
    PONTO_MEDICAO ||--o{ BASELINE : caracterizado_por
    DISPOSITIVO ||--o{ TELEMETRIA : transmite
    ENSAIO ||--o{ TELEMETRIA : contextualiza
    TELEMETRIA ||--o{ ALERTA : origina
    BASELINE ||--o{ ALERTA : referencia
    ALERTA ||--o| ORDEM_SERVICO : resulta_em
    USUARIO ||--o{ ORDEM_SERVICO : atribuida_a
    COMPONENTE ||--o{ ORDEM_SERVICO : referente_a

    LOCAL {
        bigint id PK
        varchar nome
        varchar tipo
        char uf
    }
    MAQUINA {
        bigint id PK
        bigint local_id FK
        varchar codigo UK
        varchar classe
        varchar modelo
        varchar fabricante
        date data_instalacao
        boolean ativa
    }
    PONTO_MEDICAO {
        bigint id PK
        bigint maquina_id FK
        varchar papel
        varchar descricao
        varchar fixacao
        boolean ativo
    }
    COMPONENTE {
        bigint id PK
        bigint maquina_id FK
        varchar tipo
        varchar numero_serie UK
        timestamptz instalado_em
        timestamptz removido_em
    }
    DISPOSITIVO {
        bigint id PK
        bigint maquina_id FK
        varchar identificador UK
        varchar credencial_hash
        varchar firmware_versao
        timestamptz ultimo_contato
        boolean ativo
    }
    ENSAIO {
        bigint id PK
        bigint maquina_id FK
        varchar codigo
        varchar etapa
        varchar condicao_ferramenta
        varchar material
        integer rotacao_alvo_rpm
        numeric avanco_alvo
        integer repeticao
        timestamptz iniciado_em
        timestamptz encerrado_em
    }
    TELEMETRIA {
        bigint id PK
        bigint dispositivo_id FK
        bigint ponto_medicao_id FK
        bigint ensaio_id FK
        timestamptz medido_em
        timestamptz recebido_em
        numeric rotacao_rpm
        numeric corrente_a
        numeric potencia_w
        numeric temp_c
        numeric vib_rms_g
        numeric ordem_1x
        numeric ordem_2x
        numeric ordem_3x
    }
    BASELINE {
        bigint id PK
        bigint ponto_medicao_id FK
        varchar condicao
        integer rotacao_rpm
        varchar metrica
        numeric media
        numeric desvio_padrao
        integer n_amostras
        integer versao
    }
    ALERTA {
        bigint id PK
        bigint maquina_id FK
        bigint telemetria_id FK
        bigint baseline_id FK
        varchar metrica
        numeric valor
        numeric desvio_sigma
        varchar severidade
        varchar classificacao_falha
        numeric confianca
        timestamptz criado_em
        timestamptz reconhecido_em
    }
    ORDEM_SERVICO {
        bigint id PK
        bigint maquina_id FK
        bigint alerta_id FK
        bigint componente_id FK
        varchar numero UK
        varchar status
        varchar tipo_falha
        numeric severidade_acumulada
        varchar peca_sugerida
        timestamptz aberta_em
        timestamptz concluida_em
    }
    SEVERIDADE_ACUMULADA {
        bigint id PK
        bigint maquina_id FK
        timestamptz janela_inicio
        timestamptz janela_fim
        numeric valor
        numeric horas_fora_faixa
    }
    USUARIO {
        bigint id PK
        varchar nome
        varchar email UK
        varchar senha_hash
        varchar papel
        boolean ativo
    }
```

## Decisões de modelagem

**`PONTO_MEDICAO.papel` é o que generaliza entre classes de máquina; `descricao` e `fixacao` são o
que muda.** Uma furadeira e um torno compartilham os três papéis (acionamento, ferramenta,
estrutura), mas a posição física de cada um é diferente — no torno o ponto de papel "ferramenta"
fica no carro transversal; na furadeira, no mancal do eixo-árvore. Separar papel de descrição é o
que permite consultar "todos os pontos de acionamento, de qualquer máquina" sem depender de
texto livre.

**`MAQUINA.classe` substitui a suposição implícita de que só existe sonda.** Valores esperados:
`sonda`, `torno`, `furadeira`, `fresadora`, `cnc`. A tabela de ordens esperadas por classe (1X,
2X, passagem de dentes etc.) fica no código de análise, não no banco, porque é regra de domínio
sujeita a evoluir com a literatura.

**`telemetria.ponto_medicao_id` substitui as três colunas fixas de vibração.** Cada leitura de
sensor vira uma linha, referenciando de qual ponto ela veio. Isso também resolve o problema de uma
máquina ter mais ou menos de três pontos, caso apareça essa necessidade.

**`ensaio.etapa` registra T1/T2/T3.** `condicao_ferramenta` registra o rótulo de falha não
destrutiva (`normal`, `ferramenta_desgastada`, `avanco_excessivo`, `rotacao_inadequada`) — a
substituição de falha induzida mecânica por condição de operação controlada.

**Baseline agora é por ponto de medição, não por máquina inteira.** Um ponto de acionamento e um
de estrutura têm distribuições de vibração completamente diferentes; misturá-los na mesma
referência estatística invalidaria a comparação.

**Decisões herdadas da v1, sem alteração:** `medido_em`/`recebido_em` separados para tolerar queda
de enlace; baseline versionado; severidade acumulada como tabela, não campo calculado.

## Índices compostos

| Índice | Consulta que atende |
|---|---|
| `telemetria (ponto_medicao_id, medido_em DESC)` | série temporal de um ponto no painel |
| `telemetria (dispositivo_id, medido_em DESC)` | último contato e diagnóstico do dispositivo |
| `telemetria (ensaio_id, medido_em)` | extração do conjunto de dados de um ensaio |
| `alerta (maquina_id, criado_em DESC)` | histórico de alertas por máquina |
| `alerta (severidade, reconhecido_em)` | fila do CCO, não reconhecidos primeiro |
| `ordem_servico (status, aberta_em DESC)` | painel de ordens abertas |
| `baseline (ponto_medicao_id, condicao, metrica, versao DESC)` | comparação de leitura contra referência |

## Controle de N+1

Listagens de máquina com local, e de alerta com máquina e baseline, usam `JOIN FETCH` explícito.
`spring.jpa.open-in-view` está desligado, para que acesso preguiçoso fora da transação falhe em
desenvolvimento em vez de gerar consultas silenciosas em produção.
