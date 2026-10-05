/**
 * Cor ambiente da capa (feature 059, FR-002, `logic/cor-da-capa.md`). Regra
 * pura sobre os pixels RGBA de uma miniatura da capa: devolve uma cor
 * `rgb(r, g, b)` escura o bastante para o texto do hero continuar legível,
 * ou `null` quando a capa não tem cor útil (o hero cai no gradiente neutro).
 */

/**
 * Só vale tentar ler a cor de uma capa "sem risco" (feature 059, FR-024, decisão de
 * 2026-10-05): a leitura pede a imagem em modo CORS, e quando o servidor recusa, o
 * PRÓPRIO navegador escreve a URL no console — nenhum código consegue calar isso.
 * Então só arriscamos URLs que não podem carregar credencial: http(s), sem usuário/
 * senha, sem query string e fora do domínio de qualquer painel IPTV cadastrado
 * (`panelHosts`, só nomes de host). As demais ficam no fundo neutro, sem requisição.
 */
export function isSafeCoverUrl(url: string, panelHosts: readonly string[]): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '') return false
  const host = parsed.hostname.toLowerCase()
  return !panelHosts.some((panelHost) => panelHost.toLowerCase() === host)
}

/** Pixel útil: opaco o bastante, nem quase preto nem quase branco. */
const MIN_ALPHA = 128
const NEAR_BLACK = 24
const NEAR_WHITE = 232
/** Abaixo disto a capa é quase toda fundo — a média não diria nada. */
const MIN_USABLE_SHARE = 0.1
/** Saturação mínima para haver matiz; cinza vira `null`. */
const MIN_SATURATION = 0.08
const SATURATION_FLOOR = 0.35
/** Escura o bastante para texto claro, clara o bastante para o brilho aparecer. */
const LIGHTNESS_MIN = 0.28
const LIGHTNESS_MAX = 0.42

export function dominantColorFromPixels(pixels: Uint8ClampedArray): string | null {
  const total = Math.floor(pixels.length / 4)
  if (total === 0) return null
  let r = 0
  let g = 0
  let b = 0
  let usable = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const pr = pixels[i]
    const pg = pixels[i + 1]
    const pb = pixels[i + 2]
    if (pixels[i + 3] < MIN_ALPHA) continue
    if (Math.max(pr, pg, pb) < NEAR_BLACK || Math.min(pr, pg, pb) > NEAR_WHITE) continue
    r += pr
    g += pg
    b += pb
    usable += 1
  }
  if (usable / total < MIN_USABLE_SHARE) return null

  const [h, s, l] = rgbToHsl(r / usable / 255, g / usable / 255, b / usable / 255)
  if (s < MIN_SATURATION) return null
  const [nr, ng, nb] = hslToRgb(h, Math.max(s, SATURATION_FLOOR), Math.min(LIGHTNESS_MAX, Math.max(LIGHTNESS_MIN, l)))
  // Vírgula + espaço: sintaxe que o piso `chrome108` aceita.
  return `rgb(${Math.round(nr * 255)}, ${Math.round(ng * 255)}, ${Math.round(nb * 255)})`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [(h * 60 + 360) % 360, Math.min(1, s), l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [r + m, g + m, b + m]
}
