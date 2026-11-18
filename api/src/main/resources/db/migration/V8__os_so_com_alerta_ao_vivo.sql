-- V8: a OS só nasce de alerta de máquina ativo, com tempo e severidade contados em janelas ao vivo.
-- alarme_ao_vivo_desde: início do ALARME contínuo visto em janelas ao vivo, com alerta de máquina ativo e não
-- suprimido (o em_alarme_desde da V7 conta também janelas recuperadas da fila do dispositivo).
ALTER TABLE estado_ponto ADD COLUMN alarme_ao_vivo_desde timestamptz;

COMMENT ON COLUMN estado_ponto.severidade_desde_os IS
    'Severidade (z·s) que dispara OS: só soma em janela ao vivo, ponto em ATENÇÃO ou ALARME (depois do atraso), '
    'com alerta de máquina ativo e não suprimido, fora de ensaio de condição; zera ao abrir OS';
