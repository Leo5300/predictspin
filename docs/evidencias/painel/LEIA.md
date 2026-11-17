# Evidências do painel (Partes A e B)

Tudo medido em 16/11/2026, no computador de desenvolvimento (Windows 11), contra o compose local (API,
PostgreSQL 16 e o simulador). Nada rodou contra a API publicada; nenhum ESP32 real nem celular real.
Todo dado nas prints é **simulado** (faixa hachurada e selo SIM).

## Versões

Node 24.14.0, React 19.3.1, Vite 8.3.8, TypeScript 5.9.3, ESLint 9.39.5, Vitest 5.1.0,
Playwright 1.65.0 (Chromium), axe-core 4.14.0. API: Java 21, Spring Boot 3.5.

## Resultados

| O quê | Como | Resultado |
|---|---|---|
| Lint | `npm run lint` (ESLint, `--max-warnings 0`) | sem erros nem avisos |
| Tipos | `npm run typecheck` (`tsc -b`, estrito) | sem erros |
| Testes de unidade | `npm test` (Vitest) | 132 testes em 15 arquivos, nenhuma falha |
| Cobertura do domínio | Vitest com o provedor v8 (instalado só para a medição, fora do `package.json`), `src/dominio/**` sem os testes | linhas 97,72 % (644/659); funções 96,13 %; ramos 89,37 % |
| Ponta a ponta | `npx playwright test` contra o compose | 38 cenários, nenhuma falha (as 108 prints de revisão ficam de fora: só com `PRINTS=1`) |
| Acessibilidade | axe em todas as telas, nos dois temas (`e2e/acessibilidade.spec.ts`) | zero violações sérias ou críticas |
| Dependências de produção | `npm audit --omit=dev` | nenhuma vulnerabilidade |
| Bundle | `npm run build`, gzip nível 9 calculado com zlib | 50 arquivos JS, 1.040 kB (351 kB gzip); CSS 83 kB (25 kB gzip); carregados pelo `index.html`: 4 JS com 196 kB gzip |
| Rotas sob demanda | `node scripts/medir-producao.mjs` com `npx vite preview` | 8 arquivos JS até a visão geral; 47 depois de abrir todas as telas |
| Carga inicial do `/login` | mesmo script, Chromium do Playwright, 1920×1080, contexto novo a cada vez, mediana de 5, servidor local | TTFB 4 ms, FCP 216 ms, DOMContentLoaded 80 ms, load 80 ms (numa medição anterior do mesmo dia: FCP 376 ms, load 178 ms) |
| Política de segurança | mesmo script, 7 telas | nenhuma violação |
| Detector de antipadrões | `npx`, telemetria desligada, 10 telas × 1920 e 390 | só `repeating-stripes-gradient`, que é a hachura de dado simulado exigida pela direção |
| API | `mvnw.cmd -B verify` (Testcontainers) | 229 testes, nenhuma falha; JaCoCo: 98,2 % das linhas nas classes `*Service`, 94,7 % no total |

Os tempos de carga são do servidor local, sem rede: servem para comparar versões, não para prever
o site publicado.

## Prints

As 24 prints desta pasta saíram da rodada B5 da revisão, comprimidas (paleta de 256 cores, 1.145 kB no total); as de celular com página longa foram cortadas no alto. Nome:
`<tela>-<tema>-<largura>.png`. As 108 prints de cada rodada de revisão ficam fora do Git, em
`painel/prints/`. A revisão está em [`docs/painel.md`](../../painel.md#revisão-da-parte-b).
