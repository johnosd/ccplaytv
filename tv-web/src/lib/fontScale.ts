/**
 * Escala global de fonte (`--font-scale`, `styles/font-scale.css`) lida do CSS, para alturas de linha
 * calculadas em JS (listas virtualizadas) acompanharem o texto. Sem a variável (jsdom, testes) vale 1.
 * Lida uma vez: a escala é decisão de build/CSS, não muda com o app aberto.
 */
let cached: number | undefined

export function fontScale(): number {
  if (cached !== undefined) return cached
  let value = 1
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-scale')
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed) && parsed > 0) value = parsed
  } catch {
    // sem DOM/estilos: escala neutra
  }
  cached = value
  return value
}
