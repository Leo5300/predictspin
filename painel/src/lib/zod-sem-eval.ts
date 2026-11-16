import { z } from 'zod'

// A política de segurança do site não libera eval. Sem isto, o Zod testa se pode gerar código em tempo
// de execução (new Function) e o navegador registra uma violação a cada carregamento. Este módulo é o
// primeiro importado pelo main.tsx, antes de qualquer esquema ser usado.
z.config({ jitless: true })
