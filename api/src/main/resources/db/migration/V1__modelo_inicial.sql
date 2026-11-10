-- Modelo de dados do PredictSpin (DER v3). Ver docs/der.md.
-- Grandezas medidas usam double precision (ponto flutuante de 64 bits), adequado a sinal de sensor.

-- ---------------------------------------------------------------------------
-- Cadastro
-- ---------------------------------------------------------------------------
CREATE TABLE local (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome    varchar(120) NOT NULL,
    tipo    varchar(40)  NOT NULL,
    uf      varchar(2)   NOT NULL,
    CONSTRAINT ck_local_uf CHECK (uf ~ '^[A-Z]{2}$')
);

CREATE TABLE maquina (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    local_id        bigint       NOT NULL REFERENCES local (id),
    codigo          varchar(40)  NOT NULL,
    classe          varchar(20)  NOT NULL,
    modelo          varchar(120) NOT NULL,
    fabricante      varchar(120),
    data_instalacao date,
    ativa           boolean      NOT NULL DEFAULT true,
    CONSTRAINT uk_maquina_codigo UNIQUE (codigo),
    CONSTRAINT ck_maquina_classe CHECK (classe IN ('sonda', 'torno', 'furadeira', 'fresadora', 'cnc'))
);
CREATE INDEX ix_maquina_local ON maquina (local_id);

CREATE TABLE ponto_medicao (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id  bigint       NOT NULL REFERENCES maquina (id),
    codigo      varchar(10)  NOT NULL,
    papel       varchar(20)  NOT NULL,
    descricao   varchar(200) NOT NULL,
    fixacao     varchar(120),
    ativo       boolean      NOT NULL DEFAULT true,
    CONSTRAINT uk_ponto_maquina_codigo UNIQUE (maquina_id, codigo),
    CONSTRAINT ck_ponto_papel CHECK (papel IN ('acionamento', 'ferramenta', 'estrutura'))
);

CREATE TABLE componente (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id    bigint       NOT NULL REFERENCES maquina (id),
    tipo          varchar(60)  NOT NULL,
    numero_serie  varchar(80),
    instalado_em  timestamptz,
    removido_em   timestamptz,
    CONSTRAINT uk_componente_numero_serie UNIQUE (numero_serie),
    CONSTRAINT ck_componente_periodo CHECK (removido_em IS NULL OR instalado_em IS NULL OR removido_em >= instalado_em)
);
CREATE INDEX ix_componente_maquina ON componente (maquina_id);

CREATE TABLE dispositivo (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id       bigint       NOT NULL REFERENCES maquina (id),
    identificador    varchar(60)  NOT NULL,
    credencial_hash  varchar(64)  NOT NULL,
    firmware_versao  varchar(40),
    ultimo_contato   timestamptz,
    ativo            boolean      NOT NULL DEFAULT true,
    simulado         boolean      NOT NULL DEFAULT false,
    CONSTRAINT uk_dispositivo_identificador UNIQUE (identificador)
);
CREATE INDEX ix_dispositivo_maquina ON dispositivo (maquina_id);

-- Canal: grandeza auxiliar medida a cada janela (temperatura, umidade, corrente).
-- Rotação não é canal: é atributo da janela, porque define as ordens 1X/2X/3X.
CREATE TABLE canal (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id        bigint      NOT NULL REFERENCES maquina (id),
    ponto_medicao_id  bigint      REFERENCES ponto_medicao (id),
    codigo            varchar(40) NOT NULL,
    grandeza          varchar(20) NOT NULL,
    unidade           varchar(10) NOT NULL,
    modelo_sensor     varchar(60),
    ativo             boolean     NOT NULL DEFAULT true,
    CONSTRAINT uk_canal_maquina_codigo UNIQUE (maquina_id, codigo),
    CONSTRAINT ck_canal_grandeza CHECK (grandeza IN ('temperatura', 'umidade', 'corrente', 'tensao', 'potencia'))
);

CREATE TABLE usuario (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        varchar(120) NOT NULL,
    email       varchar(160) NOT NULL,
    senha_hash  varchar(100) NOT NULL,
    papel       varchar(20)  NOT NULL,
    ativo       boolean      NOT NULL DEFAULT true,
    criado_em   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uk_usuario_email UNIQUE (email),
    CONSTRAINT ck_usuario_papel CHECK (papel IN ('ADMIN', 'TECNICO', 'OPERADOR')),
    CONSTRAINT ck_usuario_email_minusculo CHECK (email = lower(email))
);

-- ---------------------------------------------------------------------------
-- Coleta rotulada
-- ---------------------------------------------------------------------------
CREATE SEQUENCE ensaio_codigo_seq;

CREATE TABLE ensaio (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id        bigint       NOT NULL REFERENCES maquina (id),
    codigo            varchar(60)  NOT NULL,
    etapa             varchar(2)   NOT NULL,
    condicao          varchar(30)  NOT NULL,
    material          varchar(80),
    rotacao_alvo_rpm  integer      NOT NULL,
    avanco_alvo       numeric(8, 3),
    repeticao         integer      NOT NULL DEFAULT 1,
    observacao        text,
    descartado        boolean      NOT NULL DEFAULT false,
    simulado          boolean      NOT NULL DEFAULT false,
    iniciado_em       timestamptz  NOT NULL,
    encerrado_em      timestamptz,
    CONSTRAINT uk_ensaio_codigo UNIQUE (codigo),
    CONSTRAINT ck_ensaio_etapa CHECK (etapa IN ('T0', 'T1', 'T2', 'T3')),
    CONSTRAINT ck_ensaio_condicao CHECK (condicao IN ('normal', 'ferramenta_desgastada', 'avanco_excessivo', 'rotacao_inadequada')),
    CONSTRAINT ck_ensaio_rotacao CHECK (rotacao_alvo_rpm >= 0),
    CONSTRAINT ck_ensaio_repeticao CHECK (repeticao >= 1),
    CONSTRAINT ck_ensaio_periodo CHECK (encerrado_em IS NULL OR encerrado_em >= iniciado_em)
);
-- No máximo um ensaio aberto por máquina (a API responde 409 antes; o índice cobre a corrida)
CREATE UNIQUE INDEX uk_ensaio_aberto_por_maquina ON ensaio (maquina_id) WHERE encerrado_em IS NULL;
CREATE INDEX ix_ensaio_maquina_iniciado ON ensaio (maquina_id, iniciado_em DESC);
CREATE INDEX ix_ensaio_cobertura ON ensaio (maquina_id, etapa, condicao, rotacao_alvo_rpm);

-- ---------------------------------------------------------------------------
-- Telemetria
-- ---------------------------------------------------------------------------
-- Janela: um envio do dispositivo (características de ~5 s de sinal). Carrega horário, rotação
-- e ensaio; as medidas de cada ponto ficam em TELEMETRIA e as dos canais em LEITURA.
CREATE TABLE janela (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dispositivo_id  bigint            NOT NULL REFERENCES dispositivo (id),
    ensaio_id       bigint            REFERENCES ensaio (id),
    medido_em       timestamptz       NOT NULL,
    recebido_em     timestamptz       NOT NULL,
    rotacao_rpm     double precision  NOT NULL,
    saturou         boolean           NOT NULL DEFAULT false,
    -- Idempotência: reenvio do mesmo dispositivo e instante não duplica a série
    CONSTRAINT uk_janela_dispositivo_medido UNIQUE (dispositivo_id, medido_em),
    CONSTRAINT ck_janela_rotacao CHECK (rotacao_rpm >= 0)
);
-- (dispositivo_id, medido_em) já é atendido pelo índice da chave única acima, inclusive em ordem decrescente
CREATE INDEX ix_janela_ensaio_medido ON janela (ensaio_id, medido_em) WHERE ensaio_id IS NOT NULL;
CREATE INDEX ix_janela_medido ON janela (medido_em DESC);

CREATE TABLE telemetria (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    janela_id         bigint            NOT NULL REFERENCES janela (id) ON DELETE CASCADE,
    ponto_medicao_id  bigint            NOT NULL REFERENCES ponto_medicao (id),
    rms_g             double precision  NOT NULL,
    pico_g            double precision  NOT NULL,
    curtose           double precision  NOT NULL,
    ordem_1x          double precision  NOT NULL,
    ordem_2x          double precision  NOT NULL,
    ordem_3x          double precision  NOT NULL,
    CONSTRAINT uk_telemetria_janela_ponto UNIQUE (janela_id, ponto_medicao_id),
    CONSTRAINT ck_telemetria_nao_negativos CHECK (
        rms_g >= 0 AND pico_g >= 0 AND ordem_1x >= 0 AND ordem_2x >= 0 AND ordem_3x >= 0)
);
CREATE INDEX ix_telemetria_ponto_janela ON telemetria (ponto_medicao_id, janela_id DESC);

CREATE TABLE leitura (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    janela_id  bigint            NOT NULL REFERENCES janela (id) ON DELETE CASCADE,
    canal_id   bigint            NOT NULL REFERENCES canal (id),
    valor      double precision  NOT NULL,
    CONSTRAINT uk_leitura_janela_canal UNIQUE (janela_id, canal_id)
);
CREATE INDEX ix_leitura_canal_janela ON leitura (canal_id, janela_id DESC);

-- ---------------------------------------------------------------------------
-- Referência estatística, alertas e ordens de serviço
-- ---------------------------------------------------------------------------
CREATE TABLE baseline (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ponto_medicao_id  bigint            NOT NULL REFERENCES ponto_medicao (id),
    condicao          varchar(30)       NOT NULL,
    rotacao_rpm       integer           NOT NULL,
    metrica           varchar(30)       NOT NULL,
    media             double precision  NOT NULL,
    desvio_padrao     double precision  NOT NULL,
    n_amostras        integer           NOT NULL,
    versao            integer           NOT NULL DEFAULT 1,
    criado_em         timestamptz       NOT NULL DEFAULT now(),
    CONSTRAINT uk_baseline_versao UNIQUE (ponto_medicao_id, condicao, rotacao_rpm, metrica, versao),
    CONSTRAINT ck_baseline_metrica CHECK (metrica IN ('rms_g', 'pico_g', 'curtose', 'ordem_1x', 'ordem_2x', 'ordem_3x')),
    CONSTRAINT ck_baseline_amostras CHECK (n_amostras > 0 AND desvio_padrao >= 0)
);
CREATE INDEX ix_baseline_consulta ON baseline (ponto_medicao_id, condicao, metrica, versao DESC);

CREATE TABLE alerta (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id           bigint            NOT NULL REFERENCES maquina (id),
    janela_id            bigint            NOT NULL REFERENCES janela (id),
    ponto_medicao_id     bigint            REFERENCES ponto_medicao (id),
    canal_id             bigint            REFERENCES canal (id),
    baseline_id          bigint            REFERENCES baseline (id),
    metrica              varchar(30)       NOT NULL,
    valor                double precision  NOT NULL,
    desvio_sigma         double precision,
    severidade           varchar(10)       NOT NULL,
    classificacao_falha  varchar(40),
    confianca            double precision,
    versao_modelo        varchar(40),
    retorno_tecnico      varchar(12),
    criado_em            timestamptz       NOT NULL DEFAULT now(),
    reconhecido_em       timestamptz,
    -- O alerta aponta exatamente um ponto de medição ou um canal
    CONSTRAINT ck_alerta_origem CHECK ((ponto_medicao_id IS NULL) <> (canal_id IS NULL)),
    CONSTRAINT ck_alerta_severidade CHECK (severidade IN ('baixa', 'media', 'alta', 'critica')),
    CONSTRAINT ck_alerta_retorno CHECK (retorno_tecnico IS NULL OR retorno_tecnico IN ('confirmada', 'rejeitada')),
    CONSTRAINT ck_alerta_confianca CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 1))
);
CREATE INDEX ix_alerta_maquina_criado ON alerta (maquina_id, criado_em DESC);
CREATE INDEX ix_alerta_fila ON alerta (severidade, reconhecido_em);
CREATE INDEX ix_alerta_janela ON alerta (janela_id);

CREATE SEQUENCE ordem_servico_numero_seq;

CREATE TABLE ordem_servico (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id            bigint            NOT NULL REFERENCES maquina (id),
    alerta_id             bigint            REFERENCES alerta (id),
    componente_id         bigint            REFERENCES componente (id),
    responsavel_id        bigint            REFERENCES usuario (id),
    numero                varchar(30)       NOT NULL,
    status                varchar(15)       NOT NULL DEFAULT 'aberta',
    tipo_falha            varchar(40),
    severidade_acumulada  double precision,
    peca_sugerida         varchar(120),
    versao_modelo         varchar(40),
    retorno_tecnico       varchar(12),
    aberta_em             timestamptz       NOT NULL DEFAULT now(),
    concluida_em          timestamptz,
    CONSTRAINT uk_ordem_servico_numero UNIQUE (numero),
    -- Um alerta resulta em no máximo uma ordem de serviço
    CONSTRAINT uk_ordem_servico_alerta UNIQUE (alerta_id),
    CONSTRAINT ck_ordem_servico_status CHECK (status IN ('aberta', 'em_andamento', 'concluida', 'cancelada')),
    CONSTRAINT ck_ordem_servico_retorno CHECK (retorno_tecnico IS NULL OR retorno_tecnico IN ('confirmada', 'rejeitada')),
    CONSTRAINT ck_ordem_servico_periodo CHECK (concluida_em IS NULL OR concluida_em >= aberta_em)
);
CREATE INDEX ix_ordem_servico_painel ON ordem_servico (status, aberta_em DESC);
CREATE INDEX ix_ordem_servico_maquina ON ordem_servico (maquina_id);

CREATE TABLE severidade_acumulada (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id        bigint            NOT NULL REFERENCES maquina (id),
    janela_inicio     timestamptz       NOT NULL,
    janela_fim        timestamptz       NOT NULL,
    valor             double precision  NOT NULL,
    horas_fora_faixa  double precision  NOT NULL DEFAULT 0,
    CONSTRAINT ck_severidade_periodo CHECK (janela_fim > janela_inicio)
);
CREATE INDEX ix_severidade_maquina_inicio ON severidade_acumulada (maquina_id, janela_inicio DESC);
