-- IA parte B: modelos treinados em Python e executados na API como SEGUNDA OPINIÃO (o alarme continua sendo a
-- regra de z da V7). Só acrescenta: nenhuma coluna ou restrição existente fica mais estreita.

-- ---------------------------------------------------------------------------
-- Canal lento novo: nível de som (opcional no envio, como os outros canais)
-- ---------------------------------------------------------------------------
ALTER TABLE canal DROP CONSTRAINT ck_canal_grandeza;
ALTER TABLE canal ADD CONSTRAINT ck_canal_grandeza
    CHECK (grandeza IN ('temperatura', 'umidade', 'corrente', 'tensao', 'potencia', 'som'));

INSERT INTO canal (maquina_id, ponto_medicao_id, codigo, grandeza, unidade, modelo_sensor)
SELECT m.id, NULL, 'nivel_som_db', 'som', 'dB', NULL
FROM maquina m
WHERE m.codigo = 'TORNO-01'
ON CONFLICT ON CONSTRAINT uk_canal_maquina_codigo DO NOTHING;

-- ---------------------------------------------------------------------------
-- Retorno do técnico: condição encontrada (rótulo para o próximo treino; opcional)
-- ---------------------------------------------------------------------------
ALTER TABLE ordem_servico
    ADD COLUMN condicao_encontrada varchar(30),
    ADD CONSTRAINT ck_ordem_servico_condicao_encontrada CHECK (condicao_encontrada IS NULL OR condicao_encontrada IN
        ('normal', 'avanco_excessivo', 'rotacao_inadequada', 'ferramenta_desgastada', 'desbalanceamento', 'outra'));

-- ---------------------------------------------------------------------------
-- Trabalho de treino (o botão Treinar): a API cria, o serviço de treino (ou o comando no notebook) executa
-- ---------------------------------------------------------------------------
CREATE TABLE trabalho_treino (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id     bigint       NOT NULL REFERENCES maquina (id),
    simulado       boolean      NOT NULL,
    estado         varchar(12)  NOT NULL DEFAULT 'pendente',
    mensagem       text,
    criado_por_id  bigint       REFERENCES usuario (id),
    criado_em      timestamptz  NOT NULL DEFAULT now(),
    iniciado_em    timestamptz,
    concluido_em   timestamptz,
    modelo_id      bigint,
    CONSTRAINT ck_trabalho_treino_estado CHECK (estado IN ('pendente', 'acordando', 'executando', 'concluido',
        'falhou'))
);
CREATE INDEX ix_trabalho_treino_maquina ON trabalho_treino (maquina_id, simulado, id DESC);
-- No máximo um trabalho em andamento por máquina e tipo de dado
CREATE UNIQUE INDEX uk_trabalho_treino_andamento ON trabalho_treino (maquina_id, simulado)
    WHERE estado IN ('pendente', 'acordando', 'executando');

-- ---------------------------------------------------------------------------
-- Modelo: uma versão = Isolation Forest (anomalia) + Random Forest (classe, quando houve classes suficientes),
-- com os arquivos ONNX, as árvores em JSON (plano B) e as métricas da validação
-- ---------------------------------------------------------------------------
CREATE TABLE modelo (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    maquina_id            bigint            NOT NULL REFERENCES maquina (id),
    simulado              boolean           NOT NULL,
    versao                integer           NOT NULL,
    estado                varchar(10)       NOT NULL DEFAULT 'candidato',
    criado_em             timestamptz       NOT NULL DEFAULT now(),
    criado_por_id         bigint            REFERENCES usuario (id),
    ativado_em            timestamptz,
    ativado_por_id        bigint            REFERENCES usuario (id),
    trabalho_id           bigint            REFERENCES trabalho_treino (id),
    versao_vetor          varchar(10)       NOT NULL,
    referencia_versao_id  bigint            REFERENCES referencia_versao (id) ON DELETE SET NULL,
    referencia_numero     integer,
    limiar_anomalia       double precision  NOT NULL,
    caracteristicas       jsonb             NOT NULL,
    canais                jsonb             NOT NULL DEFAULT '[]',
    classes               jsonb             NOT NULL DEFAULT '[]',
    metricas              jsonb             NOT NULL,
    conjunto              jsonb             NOT NULL,
    onnx_anomalia         bytea             NOT NULL,
    onnx_classe           bytea,
    arvores               bytea,
    tamanho_bytes         integer           NOT NULL,
    CONSTRAINT uk_modelo_versao UNIQUE (maquina_id, simulado, versao),
    CONSTRAINT ck_modelo_estado CHECK (estado IN ('candidato', 'ativo', 'arquivado'))
);
-- Uma versão ATIVA por máquina e tipo de dado
CREATE UNIQUE INDEX uk_modelo_ativo ON modelo (maquina_id, simulado) WHERE estado = 'ativo';
ALTER TABLE trabalho_treino ADD CONSTRAINT fk_trabalho_treino_modelo FOREIGN KEY (modelo_id) REFERENCES modelo (id);

-- ---------------------------------------------------------------------------
-- Inferência: UMA linha compacta por janela de máquina avaliada pelo modelo ativo
-- classe: posição em modelo.classes da mais provável (nula sem classificador); "classe incerta" é decidida na
-- leitura, pela confiança (ps.modelo.confianca-min)
-- ---------------------------------------------------------------------------
CREATE TABLE inferencia (
    janela_id   bigint    NOT NULL PRIMARY KEY REFERENCES janela (id) ON DELETE CASCADE,
    modelo_id   bigint    NOT NULL REFERENCES modelo (id),
    escore      real      NOT NULL,
    anomalia    boolean   NOT NULL,
    classe      smallint,
    confianca   real
);
CREATE INDEX ix_inferencia_modelo ON inferencia (modelo_id);

-- ---------------------------------------------------------------------------
-- Segunda opinião no alerta e na OS: a do momento da abertura e a mais recente (JSON pronto para a tela:
-- modelo, versão, escore, anomalia, classe, confiança, explicação, janela e instante)
-- ---------------------------------------------------------------------------
ALTER TABLE alerta
    ADD COLUMN opiniao_abertura jsonb,
    ADD COLUMN opiniao_recente  jsonb;
ALTER TABLE ordem_servico
    ADD COLUMN opiniao_abertura jsonb,
    ADD COLUMN opiniao_recente  jsonb;
