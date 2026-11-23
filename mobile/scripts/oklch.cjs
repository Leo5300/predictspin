/**
 * Conversão de cores OKLCH (formato dos tokens do painel) para sRGB em hexadecimal, que o React Native
 * entende. Fórmulas da definição do Oklab (Björn Ottosson, 2020); fora da faixa sRGB, cada canal é
 * limitado a 0..1.
 */

function paraSrgb(linear) {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, v))
}

/** OKLCH (L 0..1, C, h em graus) para [r, g, b] em 0..1. */
function oklchParaRgb(L, C, h) {
  const rad = (h * Math.PI) / 180
  const a = C * Math.cos(rad)
  const b = C * Math.sin(rad)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    paraSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    paraSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    paraSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

function hex2(v) {
  return Math.round(v * 255)
    .toString(16)
    .padStart(2, '0')
}

/**
 * "oklch(0.42 0.07 205)" ou "oklch(0.42 0.07 205 / 0.16)" para "#rrggbb" ou "#rrggbbaa". Lança erro
 * para qualquer outro formato, para o gerador nunca deixar passar uma cor sem converter.
 */
function oklchParaHex(texto) {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/.exec(
    texto.trim(),
  )
  if (!m) throw new Error(`cor OKLCH não reconhecida: ${texto}`)
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  const [r, g, b] = oklchParaRgb(L, Number(m[3]), Number(m[4]))
  let saida = `#${hex2(r)}${hex2(g)}${hex2(b)}`
  if (m[5] !== undefined) {
    const alfa = Number(m[5]) / (m[6] ? 100 : 1)
    if (alfa < 1) saida += hex2(alfa)
  }
  return saida
}

/** Luminância relativa (WCAG 2.x) de "#rrggbb". */
function luminancia(hex) {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = canais.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razão de contraste WCAG entre duas cores opacas "#rrggbb". */
function contraste(hexA, hexB) {
  const a = luminancia(hexA)
  const b = luminancia(hexB)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

module.exports = { oklchParaHex, oklchParaRgb, contraste }
