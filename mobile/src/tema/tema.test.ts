import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CORES } from './tokens'

const { contraste, oklchParaHex } = require('../../scripts/oklch.cjs') as {
  contraste: (a: string, b: string) => number
  oklchParaHex: (t: string) => string
}

const raiz = join(__dirname, '..', '..')

describe('tokens do app gerados do painel', () => {
  it('nenhuma cor OKLCH chega ao app', () => {
    for (const arquivo of ['src/tema/tokens.ts', 'src/tema/tema.css', 'src/global.css']) {
      expect(readFileSync(join(raiz, arquivo), 'utf8')).not.toMatch(/oklch\(/i)
    }
    for (const tema of Object.values(CORES)) {
      for (const cor of Object.values(tema)) expect(cor).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
    }
  })

  it('os arquivos versionados batem com o index.css do painel', () => {
    expect(() =>
      execFileSync(process.execPath, [join(raiz, 'scripts/gerar-tema.mjs'), '--conferir'], { stdio: 'pipe' }),
    ).not.toThrow()
  })

  it('converte OKLCH para hex', () => {
    expect(oklchParaHex('oklch(1 0 0)')).toBe('#ffffff')
    expect(oklchParaHex('oklch(0 0 0)')).toBe('#000000')
    expect(oklchParaHex('oklch(0.86 0 0)')).toBe('#d1d1d1')
    expect(oklchParaHex('oklch(0.42 0 0 / 0.38)')).toBe('#4d4d4d61')
    expect(oklchParaHex('oklch(62.8% 0.2577 29.23)')).toBe('#ff0000')
    expect(() => oklchParaHex('rgb(0 0 0)')).toThrow()
  })

  it('nunca preto puro nem branco puro nas superfícies e no texto', () => {
    for (const tema of Object.values(CORES)) {
      for (const cor of [tema.fundo, tema.modulo, tema.rebaixo, tema.texto]) {
        expect(cor).not.toBe('#000000')
        expect(cor).not.toBe('#ffffff')
      }
    }
  })

  it('texto com contraste 4,5:1 ou mais sobre todas as superfícies (WCAG 2.2 AA)', () => {
    for (const [nome, tema] of Object.entries(CORES)) {
      for (const superficie of [tema.fundo, tema.modulo, tema.rebaixo]) {
        for (const texto of [tema.texto, tema.apoio, tema.fraco, tema.atencaoTexto, tema.alarmeTexto, tema.info]) {
          const razao = contraste(texto, superficie)
          if (razao < 4.5) throw new Error(`${nome}: ${texto} sobre ${superficie} = ${razao.toFixed(2)}:1`)
        }
      }
      expect(contraste(tema.acaoTexto, tema.acao)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(tema.alarmeSobre, tema.alarme)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(tema.atencaoSobre, tema.atencao)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('pontos A, B e C em tons neutros (nenhum vermelho, âmbar ou amarelo)', () => {
    for (const tema of Object.values(CORES)) {
      for (const cor of [tema.pontoA, tema.pontoB, tema.pontoC]) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16))
        expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(4)
      }
    }
  })
})
