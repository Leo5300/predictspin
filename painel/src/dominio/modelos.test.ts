import { describe, expect, it } from 'vitest'

import {
  emAndamento,
  intensidades,
  nomeDaCaracteristica,
  nomeDaClasse,
  porcento,
  resumoDaOpiniao,
} from './modelos'

describe('segunda opinião', () => {
  it('nomes das classes e das características', () => {
    expect(nomeDaClasse('avanco_excessivo')).toBe('avanço excessivo')
    expect(nomeDaClasse(null)).toBe('—')
    expect(nomeDaClasse('nova_classe')).toBe('nova classe')
    expect(nomeDaCaracteristica('z_B_rms_g')).toBe('B·RMS')
    expect(nomeDaCaracteristica('z_A_o1x')).toBe('A·1X')
    expect(nomeDaCaracteristica('etapa_t3')).toBe('corte (T3)')
    expect(nomeDaCaracteristica('canal_nivel_som_db')).toBe('canal nivel som db')
  })

  it('resume a opinião sem esconder a incerteza', () => {
    expect(resumoDaOpiniao({ classe: 'desbalanceamento', confianca: 0.78, incerta: false, anomalia: true })).toBe(
      'desbalanceamento, 78%',
    )
    expect(
      resumoDaOpiniao({ classe: 'avanco_excessivo', confianca: 0.45, incerta: true, anomalia: true }),
    ).toBe('classe incerta (mais parecida: avanço excessivo, 45%)')
    expect(resumoDaOpiniao({ classe: null, confianca: null, incerta: false, anomalia: false })).toBe(
      'o modelo não vê anomalia',
    )
  })

  it('matriz de confusão em um tom só, pela linha', () => {
    expect(
      intensidades([
        [3, 1],
        [0, 0],
      ]),
    ).toEqual([
      [0.75, 0.25],
      [0, 0],
    ])
  })

  it('formatos e estados', () => {
    expect(porcento(0.125, 1)).toBe('12,5%')
    expect(porcento(undefined)).toBe('—')
    expect(emAndamento('acordando')).toBe(true)
    expect(emAndamento('falhou')).toBe(false)
  })
})
