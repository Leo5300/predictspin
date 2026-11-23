// Regras do Expo (React, hooks, importações) e nenhum aviso tolerado (npm run lint usa --max-warnings 0)
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    // simulações dos testes carregam módulos com require dentro de jest.mock
    files: ['src/testes/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*', 'src/api/esquema.d.ts', 'src/uniwind-types.d.ts'],
  },
])
