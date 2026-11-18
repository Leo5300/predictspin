-- V7: referência aprendida, avaliação de cada janela, alertas no padrão ISA-18.2 e ordem de serviço.
-- A tabela "baseline" da V1 nunca foi usada e fica como está: a referência passa a viver em
-- referencia_versao e referencia_celula (mediana e dispersão robusta, por marcha, etapa e receita).

-- ---------------------------------------------------------------------------
-- Referência: versões imutáveis, cada uma com as suas células
-- ---------------------------------------------------------------------------
CREATE TABLE referencia_versao (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id       bigint       NOT NULL REFERENCES maquina (id),
    simulado         boolean      NOT NULL,
    numero           integer      NOT NULL,
    criada_em        timestamptz  NOT NULL,
    autor_id         bigint       REFERENCES usuario (id),
    janelas_usadas   integer      NOT NULL,
    janelas_deriva   integer      NOT NULL DEFAULT 0,
    -- janelas excluídas por motivo, ex.: {"saturou": 3, "modo_rapido": 12}
    excluidas        jsonb        NOT NULL DEFAULT '{}',
    -- parâmetros em uso no cálculo (min_janelas, sigma_min_fracao, deriva...)
    parametros       jsonb        NOT NULL DEFAULT '{}',
    CONSTRAINT uk_referencia_versao UNIQUE (maquina_id, simulado, numero),
    CONSTRAINT ck_referencia_versao_numero CHECK (numero >= 1),
    CONSTRAINT ck_referencia_versao_janelas CHECK (janelas_usadas >= 0 AND janelas_deriva >= 0)
);

CREATE TABLE referencia_celula (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    versao_id         bigint            NOT NULL REFERENCES referencia_versao (id) ON DELETE CASCADE,
    ponto_medicao_id  bigint            NOT NULL REFERENCES ponto_medicao (id),
    medida            varchar(15)       NOT NULL,
    -- 0 no T0 (torno parado); nas outras etapas, a rotação nominal mais próxima da medida
    marcha_rpm        integer           NOT NULL,
    etapa             varchar(2)        NOT NULL,
    -- true: célula de uma receita (material + ferramenta) no T3; false: T0, T1 ou T3 genérica
    por_receita       boolean           NOT NULL DEFAULT false,
    material_id       bigint            REFERENCES material (id),
    ferramenta_id     bigint            REFERENCES ferramenta (id),
    n                 integer           NOT NULL,
    n_deriva          integer           NOT NULL DEFAULT 0,
    mediana           double precision  NOT NULL,
    sigma             double precision  NOT NULL,
    p95               double precision  NOT NULL,
    piso_ruido        double precision,
    sigma_efetivo     double precision  NOT NULL,
    suficiente        boolean           NOT NULL,
    calibracao        varchar(40),
    firmware_versoes  varchar(200),
    CONSTRAINT ck_referencia_celula_medida CHECK (medida IN
        ('rms_g', 'pico_g', 'curtose', 'o1x', 'o2x', 'o3x', 'vel_rms_mm_s')),
    CONSTRAINT ck_referencia_celula_etapa CHECK (etapa IN ('T0', 'T1', 'T3')),
    CONSTRAINT ck_referencia_celula_receita CHECK (NOT por_receita OR (etapa = 'T3'
        AND (material_id IS NOT NULL OR ferramenta_id IS NOT NULL))),
    CONSTRAINT ck_referencia_celula_n CHECK (n >= 1 AND n_deriva >= 0 AND n_deriva <= n),
    CONSTRAINT ck_referencia_celula_dispersao CHECK (sigma >= 0 AND sigma_efetivo >= 0)
);
CREATE UNIQUE INDEX uk_referencia_celula ON referencia_celula
    (versao_id, ponto_medicao_id, medida, marcha_rpm, etapa, por_receita,
     coalesce(material_id, 0), coalesce(ferramenta_id, 0));

-- ---------------------------------------------------------------------------
-- Avaliação: UMA linha por janela e ponto, com os z de cada medida (real = 4 bytes)
-- situacao: 0 avaliada, 1 sem referência, 2 sem referência completa, 3 calibração diferente,
--           4 não avaliável (rotação fora da marcha, saturação ou amostras faltando)
-- estado:   0 normal, 1 atenção, 2 alarme (nulo quando a janela não foi avaliada)
-- ---------------------------------------------------------------------------
CREATE TABLE avaliacao (
    janela_id             bigint      NOT NULL REFERENCES janela (id) ON DELETE CASCADE,
    ponto_medicao_id      bigint      NOT NULL REFERENCES ponto_medicao (id),
    referencia_versao_id  bigint      REFERENCES referencia_versao (id) ON DELETE SET NULL,
    situacao              smallint    NOT NULL,
    estado                smallint,
    etapa_ref             varchar(2),
    generica              boolean     NOT NULL DEFAULT false,
    z_rms                 real,
    z_pico                real,
    z_curtose             real,
    z_o1x                 real,
    z_o2x                 real,
    z_o3x                 real,
    z_vel                 real,
    PRIMARY KEY (janela_id, ponto_medicao_id),
    CONSTRAINT ck_avaliacao_situacao CHECK (situacao BETWEEN 0 AND 4),
    CONSTRAINT ck_avaliacao_estado CHECK (estado IS NULL OR estado BETWEEN 0 AND 2)
);

-- Máquina de estados de cada ponto (atraso e histerese da ISA-18.2, alerta de instrumento, severidade
-- desde a última OS). Uma linha por ponto e tipo de dado; é atualizada, não cresce.
CREATE TABLE estado_ponto (
    ponto_medicao_id      bigint            NOT NULL REFERENCES ponto_medicao (id),
    simulado              boolean           NOT NULL,
    estado                smallint          NOT NULL DEFAULT 0,
    ultimo_medido_em      timestamptz,
    atencao_desde         timestamptz,
    alarme_desde          timestamptz,
    abaixo_desde          timestamptz,
    em_alarme_desde       timestamptz,
    ausente_desde         timestamptz,
    sinal_baixo_desde     timestamptz,
    falha_amostragem_em   timestamptz,
    instrumento_ok_desde  timestamptz,
    instrumento_ativo     boolean           NOT NULL DEFAULT false,
    severidade_desde_os   double precision  NOT NULL DEFAULT 0,
    PRIMARY KEY (ponto_medicao_id, simulado),
    CONSTRAINT ck_estado_ponto_estado CHECK (estado BETWEEN 0 AND 2)
);

-- Severidade acumulada passa a ser por ponto e por dia (unidade z·s), separada entre real e simulado
ALTER TABLE severidade_acumulada
    ADD COLUMN ponto_medicao_id bigint REFERENCES ponto_medicao (id),
    ADD COLUMN simulado         boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX uk_severidade_ponto_dia ON severidade_acumulada (ponto_medicao_id, simulado, janela_inicio)
    WHERE ponto_medicao_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Componente provável por ponto e ação recomendada
-- ---------------------------------------------------------------------------
ALTER TABLE componente ADD COLUMN ponto_medicao_id bigint REFERENCES ponto_medicao (id);
CREATE UNIQUE INDEX uk_componente_ponto ON componente (ponto_medicao_id) WHERE ponto_medicao_id IS NOT NULL;

INSERT INTO componente (maquina_id, tipo, ponto_medicao_id)
SELECT pm.maquina_id, c.tipo, pm.id
FROM ponto_medicao pm
JOIN maquina m ON m.id = pm.maquina_id
JOIN (VALUES
    ('A', 'eixo-árvore e mancal dianteiro'),
    ('B', 'ferramenta e porta-ferramenta'),
    ('C', 'estrutura e base')
) AS c (codigo, tipo) ON c.codigo = pm.codigo
WHERE m.codigo = 'TORNO-01';

-- Orientação de inspeção (não diagnóstico) por papel do ponto e medida dominante (a de maior z).
-- "*" vale para qualquer medida; no alerta de instrumento, {ponto} vira o código do ponto.
CREATE TABLE acao_recomendada (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo    varchar(12)  NOT NULL,
    papel   varchar(20)  NOT NULL,
    medida  varchar(15)  NOT NULL,
    texto   text         NOT NULL,
    CONSTRAINT uk_acao_recomendada UNIQUE (tipo, papel, medida),
    CONSTRAINT ck_acao_recomendada_tipo CHECK (tipo IN ('maquina', 'instrumento'))
);

INSERT INTO acao_recomendada (tipo, papel, medida, texto) VALUES
    ('maquina', 'acionamento', 'o1x', 'Conferir a fixação e o balanceamento da peça na placa. Se continuar sem peça, pedir ao técnico para verificar o mancal do eixo-árvore.'),
    ('maquina', 'acionamento', 'o2x', 'Conferir com o técnico o alinhamento e o aperto do conjunto do cabeçote e da placa.'),
    ('maquina', 'acionamento', 'o3x', 'Conferir folgas e parafusos soltos no cabeçote e na placa.'),
    ('maquina', 'acionamento', 'rms_g', 'Conferir folgas e parafusos soltos no cabeçote e na placa.'),
    ('maquina', 'acionamento', 'vel_rms_mm_s', 'Conferir folgas e parafusos soltos no cabeçote e na placa.'),
    ('maquina', 'acionamento', 'pico_g', 'Conferir folgas e parafusos soltos no cabeçote e na placa.'),
    ('maquina', 'ferramenta', 'o1x', 'Conferir a fixação da peça na placa e quanto ela fica para fora da placa (balanço).'),
    ('maquina', 'ferramenta', '*', 'Conferir o estado da ferramenta (desgaste ou lasca) e reduzir o avanço ou a profundidade de corte.'),
    ('maquina', 'estrutura', '*', 'Conferir se há outra máquina próxima ligada e o aperto da base e dos pés do torno.'),
    ('instrumento', '*', '*', 'Conferir a fixação do sensor {ponto} (ímã, superfície, cabo puxando ou solto) antes de agir na máquina.');

-- ---------------------------------------------------------------------------
-- Alerta: ciclo de vida ISA-18.2. A coluna "severidade" (V1) guarda a prioridade (baixa ou alta).
-- ---------------------------------------------------------------------------
ALTER TABLE alerta
    ADD COLUMN tipo                  varchar(12)       NOT NULL DEFAULT 'maquina',
    ADD COLUMN estado                varchar(30)       NOT NULL DEFAULT 'ativo_nao_reconhecido',
    ADD COLUMN nivel                 varchar(8)        NOT NULL DEFAULT 'atencao',
    ADD COLUMN pior_nivel            varchar(8)        NOT NULL DEFAULT 'atencao',
    ADD COLUMN pior_z                double precision,
    ADD COLUMN explicacao            text,
    ADD COLUMN acao_recomendada      text,
    ADD COLUMN componente_id         bigint            REFERENCES componente (id),
    ADD COLUMN referencia_versao_id  bigint            REFERENCES referencia_versao (id),
    ADD COLUMN firmware_versao       varchar(40),
    ADD COLUMN calibracao            varchar(40),
    ADD COLUMN ensaio_id             bigint            REFERENCES ensaio (id),
    ADD COLUMN condicao_ensaio       varchar(30),
    ADD COLUMN simulado              boolean           NOT NULL DEFAULT false,
    ADD COLUMN reconhecido_por_id    bigint            REFERENCES usuario (id),
    ADD COLUMN normalizado_em        timestamptz,
    ADD COLUMN encerrado_em          timestamptz,
    ADD COLUMN suprimido_ate         timestamptz,
    ADD COLUMN motivo_supressao      text,
    ADD COLUMN suprimido_por_id      bigint            REFERENCES usuario (id),
    ADD COLUMN atualizado_em         timestamptz,
    ADD CONSTRAINT ck_alerta_tipo CHECK (tipo IN ('maquina', 'instrumento')),
    ADD CONSTRAINT ck_alerta_estado CHECK (estado IN ('ativo_nao_reconhecido', 'ativo_reconhecido',
        'normalizado_nao_reconhecido', 'encerrado', 'suprimido')),
    ADD CONSTRAINT ck_alerta_nivel CHECK (nivel IN ('atencao', 'alarme') AND pior_nivel IN ('atencao', 'alarme')),
    ADD CONSTRAINT ck_alerta_supressao CHECK (estado <> 'suprimido' OR (suprimido_ate IS NOT NULL
        AND motivo_supressao IS NOT NULL));
-- Um alerta ativo (ou suprimido) por ponto, tipo e tipo de dado: piorar atualiza, não abre outro
CREATE UNIQUE INDEX uk_alerta_ativo_por_ponto ON alerta (ponto_medicao_id, tipo, simulado)
    WHERE estado IN ('ativo_nao_reconhecido', 'ativo_reconhecido', 'suprimido');
CREATE INDEX ix_alerta_estado ON alerta (estado, criado_em DESC);

CREATE TABLE alerta_historico (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alerta_id    bigint       NOT NULL REFERENCES alerta (id) ON DELETE CASCADE,
    acao         varchar(25)  NOT NULL,
    estado       varchar(30)  NOT NULL,
    nivel        varchar(8)   NOT NULL,
    usuario_id   bigint       REFERENCES usuario (id),
    detalhe      text,
    ocorrido_em  timestamptz  NOT NULL
);
CREATE INDEX ix_alerta_historico_alerta ON alerta_historico (alerta_id, id);

-- ---------------------------------------------------------------------------
-- Ordem de serviço
-- ---------------------------------------------------------------------------
ALTER TABLE ordem_servico
    ADD COLUMN ponto_medicao_id      bigint            REFERENCES ponto_medicao (id),
    ADD COLUMN motivo_abertura       varchar(20),
    ADD COLUMN explicacao            text,
    ADD COLUMN acao_recomendada      text,
    ADD COLUMN referencia_versao_id  bigint            REFERENCES referencia_versao (id),
    ADD COLUMN firmware_versao       varchar(40),
    ADD COLUMN calibracao            varchar(40),
    ADD COLUMN simulado              boolean           NOT NULL DEFAULT false,
    ADD COLUMN assumida_em           timestamptz,
    ADD COLUMN comentario_tecnico    text,
    ADD CONSTRAINT ck_ordem_servico_motivo CHECK (motivo_abertura IS NULL
        OR motivo_abertura IN ('alarme_continuo', 'severidade'));
-- No máximo uma OS aberta (ou em andamento) por ponto e tipo de dado
CREATE UNIQUE INDEX uk_ordem_servico_aberta_por_ponto ON ordem_servico (ponto_medicao_id, simulado)
    WHERE status IN ('aberta', 'em_andamento') AND ponto_medicao_id IS NOT NULL;
