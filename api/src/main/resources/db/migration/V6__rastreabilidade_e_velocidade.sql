-- V6: rastreabilidade de cada janela e velocidade RMS por ponto (firmware de 17/11/2026)
--   * telemetria: velocidade RMS em mm/s (10 Hz a ~800 Hz), opcional;
--   * janela: versão do firmware, identificador da calibração de cada ponto e eixo de análise de
--     cada ponto, em texto compacto (objeto JSON ponto -> valor). Tudo opcional: o envio antigo
--     continua válido e as janelas antigas ficam com nulo.

ALTER TABLE telemetria
    ADD COLUMN vel_rms_mm_s double precision,
    ADD CONSTRAINT ck_telemetria_vel_rms CHECK (vel_rms_mm_s IS NULL OR vel_rms_mm_s >= 0);

ALTER TABLE janela
    ADD COLUMN firmware_versao varchar(40),
    ADD COLUMN calibracao      text,
    ADD COLUMN eixos           text;

COMMENT ON COLUMN telemetria.vel_rms_mm_s IS 'Velocidade RMS em mm/s calculada pelo dispositivo (banda de 10 Hz a ~800 Hz); nulo se não enviada';
COMMENT ON COLUMN janela.firmware_versao IS 'Versão do firmware que mediu a janela ("simulado" no simulador)';
COMMENT ON COLUMN janela.calibracao IS 'Identificador da calibração de cada ponto, JSON compacto: {"A":"A-20261117T143200Z","B":"nominal"}';
COMMENT ON COLUMN janela.eixos IS 'Eixo de análise de cada ponto, JSON compacto: {"A":"z","B":"z"}';
