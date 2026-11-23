/**
 * Relógio monotônico (não anda para trás nem salta com o ajuste do relógio do celular), para contar
 * a idade do dado. Separado para os testes poderem controlar o tempo.
 */
export function agoraMonotonicoMs(): number {
  return performance.now()
}
