-- V3: o que o firmware de 3 sensores precisa
--   * condições de ensaio novas: desbalanceamento (classe de treino) e sensor_solto (validação do
--     alerta de instrumento; nunca é classe de treino);
--   * janela: modo de envio (normal a cada 5 s, rapido a cada 1 s) e contagem de amostras;
--   * máquina: prazo do modo rápido pedido por um usuário (ao vivo).

ALTER TABLE ensaio DROP CONSTRAINT ck_ensaio_condicao;
ALTER TABLE ensaio ADD CONSTRAINT ck_ensaio_condicao CHECK (condicao IN (
    'normal', 'ferramenta_desgastada', 'avanco_excessivo', 'rotacao_inadequada',
    'desbalanceamento', 'sensor_solto'));

-- Envio antigo continua válido: sem "modo", a janela é normal; sem contagem, as colunas ficam nulas
ALTER TABLE janela
    ADD COLUMN modo               varchar(10) NOT NULL DEFAULT 'normal',
    ADD COLUMN amostras           integer,
    ADD COLUMN amostras_esperadas integer,
    ADD CONSTRAINT ck_janela_modo CHECK (modo IN ('normal', 'rapido')),
    ADD CONSTRAINT ck_janela_amostras CHECK (amostras IS NULL OR amostras >= 0),
    ADD CONSTRAINT ck_janela_amostras_esperadas CHECK (amostras_esperadas IS NULL OR amostras_esperadas > 0);

-- Até quando a máquina está em modo rápido; nulo ou no passado = modo normal
ALTER TABLE maquina ADD COLUMN modo_rapido_ate timestamptz;
