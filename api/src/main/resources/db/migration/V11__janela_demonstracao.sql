-- Barra de demonstração (docs/demo.md): a janela gerada pela própria API para a apresentação fica marcada.
-- A marca tira a janela de tudo o que aprende com o uso: deriva da referência, retorno da OS no conjunto de
-- treino e indicadores de deriva do Diagnóstico. Só acrescenta uma coluna com padrão falso; nada existente muda.
ALTER TABLE janela ADD COLUMN demonstracao boolean NOT NULL DEFAULT false;
