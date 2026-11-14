-- V5: receita do corte, catálogos e eventos marcados
--   * material e ferramenta: catálogos com nome único pelo nome normalizado (minúsculas, sem acento,
--     sem pontuação, espaços colapsados). Começam vazios;
--   * ensaio: receita do corte (todos os campos opcionais) apontando para os catálogos;
--   * ensaio_alteracao: histórico das correções da receita (campo, valor antigo, novo, quem, quando);
--   * ensaio_evento: instante em que algo fora do plano aconteceu durante um ensaio aberto.

CREATE TABLE material (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome              varchar(80)  NOT NULL,
    nome_normalizado  varchar(80)  NOT NULL,
    descricao         varchar(200),
    ativo             boolean      NOT NULL DEFAULT true,
    criado_por        bigint       REFERENCES usuario (id),
    criado_em         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uk_material_nome_normalizado UNIQUE (nome_normalizado),
    CONSTRAINT ck_material_nome CHECK (length(trim(nome)) > 0 AND length(nome_normalizado) > 0)
);

CREATE TABLE ferramenta (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome              varchar(80)  NOT NULL,
    nome_normalizado  varchar(80)  NOT NULL,
    descricao         varchar(200),
    ativo             boolean      NOT NULL DEFAULT true,
    criado_por        bigint       REFERENCES usuario (id),
    criado_em         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uk_ferramenta_nome_normalizado UNIQUE (nome_normalizado),
    CONSTRAINT ck_ferramenta_nome CHECK (length(trim(nome)) > 0 AND length(nome_normalizado) > 0)
);

-- Receita do corte. A coluna de texto "material" continua (o simulador e scripts mandam texto); quando
-- há item do catálogo, ela guarda o nome dele.
ALTER TABLE ensaio
    ADD COLUMN material_id            bigint REFERENCES material (id),
    ADD COLUMN ferramenta_id          bigint REFERENCES ferramenta (id),
    ADD COLUMN profundidade_corte_mm  numeric(6, 3),
    ADD COLUMN diametro_peca_mm       numeric(7, 2),
    ADD COLUMN fluido_corte           varchar(15),
    ADD CONSTRAINT ck_ensaio_fluido CHECK (fluido_corte IS NULL
        OR fluido_corte IN ('seco', 'emulsao', 'oleo_integral', 'outro')),
    ADD CONSTRAINT ck_ensaio_profundidade CHECK (profundidade_corte_mm IS NULL OR profundidade_corte_mm > 0),
    ADD CONSTRAINT ck_ensaio_diametro CHECK (diametro_peca_mm IS NULL OR diametro_peca_mm > 0);
CREATE INDEX ix_ensaio_material ON ensaio (material_id) WHERE material_id IS NOT NULL;
CREATE INDEX ix_ensaio_ferramenta ON ensaio (ferramenta_id) WHERE ferramenta_id IS NOT NULL;

CREATE TABLE ensaio_alteracao (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ensaio_id     bigint       NOT NULL REFERENCES ensaio (id),
    campo         varchar(40)  NOT NULL,
    valor_antigo  text,
    valor_novo    text,
    alterado_por  bigint       REFERENCES usuario (id),
    alterado_em   timestamptz  NOT NULL
);
CREATE INDEX ix_ensaio_alteracao_ensaio ON ensaio_alteracao (ensaio_id, alterado_em);

CREATE TABLE ensaio_evento (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ensaio_id    bigint        NOT NULL REFERENCES ensaio (id),
    ocorrido_em  timestamptz   NOT NULL,
    motivo       varchar(20)   NOT NULL,
    nota         varchar(500),
    criado_por   bigint        REFERENCES usuario (id),
    criado_em    timestamptz   NOT NULL,
    CONSTRAINT ck_ensaio_evento_motivo CHECK (motivo IN ('pancada', 'cavaco', 'maquina_vizinha', 'outro'))
);
CREATE INDEX ix_ensaio_evento_ensaio ON ensaio_evento (ensaio_id, ocorrido_em);
