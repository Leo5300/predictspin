-- App parte B: notificação (push) de alarme pelo serviço de push do Expo. Só acrescenta tabelas novas;
-- nenhuma coluna ou restrição existente muda.

-- ---------------------------------------------------------------------------
-- Aparelho de cada usuário que aceitou receber notificação (token do Expo, um por instalação do app)
-- ---------------------------------------------------------------------------
CREATE TABLE push_aparelho (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id     bigint       NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
    token          varchar(200) NOT NULL,
    plataforma     varchar(10)  NOT NULL,
    criado_em      timestamptz  NOT NULL DEFAULT now(),
    ultimo_uso_em  timestamptz  NOT NULL DEFAULT now(),
    ativo          boolean      NOT NULL DEFAULT true,
    CONSTRAINT uk_push_aparelho_token UNIQUE (token),
    CONSTRAINT ck_push_aparelho_plataforma CHECK (plataforma IN ('android', 'ios'))
);

CREATE INDEX ix_push_aparelho_usuario_ativo ON push_aparelho (usuario_id) WHERE ativo;

-- ---------------------------------------------------------------------------
-- Decisão de envio: no máximo um push por alarme, por OS e por alerta de instrumento (as restrições únicas),
-- e o intervalo mínimo entre pushes do mesmo ponto e tipo (ps.push.intervalo-min). Guarda também o que foi
-- segurado pelo intervalo ou ficou sem destinatário, para o "um push por alarme" valer mesmo assim.
-- ---------------------------------------------------------------------------
CREATE TABLE push_envio (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo              varchar(12)  NOT NULL,
    alerta_id         bigint       REFERENCES alerta (id) ON DELETE CASCADE,
    ordem_servico_id  bigint       REFERENCES ordem_servico (id) ON DELETE CASCADE,
    ponto_medicao_id  bigint       NOT NULL REFERENCES ponto_medicao (id),
    simulado          boolean      NOT NULL,
    resultado         varchar(16)  NOT NULL DEFAULT 'pendente',
    destinatarios     integer      NOT NULL DEFAULT 0,
    criado_em         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_push_envio_tipo CHECK (tipo IN ('alarme', 'os', 'instrumento')),
    CONSTRAINT ck_push_envio_resultado CHECK (resultado IN ('pendente', 'enviado', 'falhou', 'intervalo',
        'sem_destinatario')),
    CONSTRAINT ck_push_envio_origem CHECK ((tipo = 'os') = (ordem_servico_id IS NOT NULL)
        AND (tipo <> 'os') = (alerta_id IS NOT NULL)),
    CONSTRAINT uk_push_envio_alerta UNIQUE (tipo, alerta_id),
    CONSTRAINT uk_push_envio_os UNIQUE (ordem_servico_id)
);

CREATE INDEX ix_push_envio_ponto ON push_envio (ponto_medicao_id, tipo, simulado, criado_em DESC);
