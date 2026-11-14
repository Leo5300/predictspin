export const RETICULA_COLUNAS = 10
export const RETICULA_LINHAS = 8
export const RETICULA_SUBDIVISOES = 5

/** A mesma retícula num canvas: usada pelos gráficos de tendência (dentro da área do traçado). */
export function desenharReticula(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  cores: { reticula: string; fina: string },
) {
  const linha = (cor: string, colunas: number, linhas: number) => {
    ctx.beginPath()
    ctx.strokeStyle = cor
    ctx.lineWidth = 1
    for (let i = 0; i <= colunas; i++) {
      const px = Math.round(x + (largura * i) / colunas) + 0.5
      ctx.moveTo(px, y)
      ctx.lineTo(px, y + altura)
    }
    for (let j = 0; j <= linhas; j++) {
      const py = Math.round(y + (altura * j) / linhas) + 0.5
      ctx.moveTo(x, py)
      ctx.lineTo(x + largura, py)
    }
    ctx.stroke()
  }
  ctx.save()
  linha(cores.fina, RETICULA_COLUNAS * RETICULA_SUBDIVISOES, RETICULA_LINHAS * RETICULA_SUBDIVISOES)
  linha(cores.reticula, RETICULA_COLUNAS, RETICULA_LINHAS)
  ctx.restore()
}
