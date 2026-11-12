-- V4: plano de coleta da máquina
--   * rotacoes_nominais_rpm: as rotações que a máquina oferece (placa de rotações do cabeçote);
--   * rotacoes_coleta_rpm:   as rotações escolhidas para a grade de cobertura da coleta (começa vazia).

ALTER TABLE maquina
    ADD COLUMN rotacoes_nominais_rpm integer[] NOT NULL DEFAULT '{}',
    ADD COLUMN rotacoes_coleta_rpm   integer[] NOT NULL DEFAULT '{}';

-- Rotações lidas da tabela do torno ROMI Tormax 30. O valor 265 ainda será conferido na placa.
UPDATE maquina
SET rotacoes_nominais_rpm = ARRAY[45, 71, 90, 112, 140, 180, 224, 265, 280, 355, 450, 560, 710, 900,
                                  1120, 1400, 1800, 2240]
WHERE codigo = 'TORNO-01';
