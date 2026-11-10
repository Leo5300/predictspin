-- Dados iniciais: o torno do laboratório do SENAI São Carlos, seus pontos de medição e canais.
-- Usuário ADMIN e dispositivos NÃO entram aqui: são criados na subida da aplicação a partir de
-- variáveis de ambiente, para que nenhuma senha ou chave fique no repositório.

INSERT INTO local (nome, tipo, uf)
VALUES ('SENAI São Carlos', 'laboratorio', 'SP');

INSERT INTO maquina (local_id, codigo, classe, modelo, fabricante, ativa)
SELECT id, 'TORNO-01', 'torno', 'ROMI Tormax 30', 'ROMI', true
FROM local WHERE nome = 'SENAI São Carlos';

INSERT INTO ponto_medicao (maquina_id, codigo, papel, descricao)
SELECT m.id, p.codigo, p.papel, p.descricao
FROM maquina m
CROSS JOIN (VALUES
    ('A', 'acionamento', 'Cabeçote'),
    ('B', 'ferramenta',  'Carro'),
    ('C', 'estrutura',   'Ponta do barramento')
) AS p (codigo, papel, descricao)
WHERE m.codigo = 'TORNO-01';

INSERT INTO canal (maquina_id, ponto_medicao_id, codigo, grandeza, unidade, modelo_sensor)
SELECT m.id, pm.id, c.codigo, c.grandeza, c.unidade, c.modelo_sensor
FROM maquina m
CROSS JOIN (VALUES
    ('temp_cabecote_c',   'temperatura', '°C', 'A', 'DS18B20'),
    ('temp_ferramenta_c', 'temperatura', '°C', 'B', 'DS18B20'),
    ('amb_temp_c',        'temperatura', '°C', NULL, NULL),
    ('amb_umid_pct',      'umidade',     '%',  NULL, NULL),
    ('corrente_a',        'corrente',    'A',  NULL, NULL)
) AS c (codigo, grandeza, unidade, ponto, modelo_sensor)
LEFT JOIN ponto_medicao pm ON pm.maquina_id = m.id AND pm.codigo = c.ponto
WHERE m.codigo = 'TORNO-01';
