import type { Avaliacao } from '@/dominio/estado'

/**
 * Formas de estado. Todo estado aparece em pelo menos dois de três canais (cor, forma e texto): a
 * forma muda junto com a cor, então o estado continua legível sem cor.
 *   círculo = normal ou sem referência · triângulo = atenção · losango = alarme
 */
export type Forma = 'circulo' | 'triangulo' | 'losango' | 'quadrado' | 'anel'

export const FORMA_DA_AVALIACAO: Record<Avaliacao, Forma> = {
  sem_referencia: 'circulo',
  normal: 'circulo',
  atencao: 'triangulo',
  alarme: 'losango',
}

export const CAMINHO_DA_FORMA: Record<Forma, string> = {
  circulo: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z',
  triangulo: 'M12 2.5 22.5 21h-21Z',
  losango: 'M12 1.5 22.5 12 12 22.5 1.5 12Z',
  quadrado: 'M3.5 3.5h17v17h-17Z',
  anel: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 3.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 0 1 0-11Z',
}
