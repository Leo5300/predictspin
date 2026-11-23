/** Testes com jest-expo; cobertura medida em src/dominio e src/api (meta do app: 85% de linhas). */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./src/testes/preparar.ts'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx', '<rootDir>/scripts/**/*.test.js'],
  collectCoverageFrom: [
    'src/dominio/**/*.ts',
    'src/api/**/*.ts',
    '!src/api/esquema.d.ts',
    '!src/**/*.test.ts',
  ],
  coverageThreshold: {
    'src/dominio/**/*.ts': { lines: 85 },
    'src/api/**/*.ts': { lines: 85 },
  },
  coverageReporters: ['text-summary', 'text'],
}
