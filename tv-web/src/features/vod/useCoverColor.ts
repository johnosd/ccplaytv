import { useEffect, useState } from 'react'
import { dominantColorFromPixels, isSafeCoverUrl } from '../../lib/color/coverColor'

/**
 * Cor ambiente da capa para o hero do detalhe (feature 059, FR-002,
 * `logic/cor-da-capa.md` §1). Roda uma vez ao abrir o detalhe, para a capa que
 * a tela já mostra — nunca ao focar. Nunca bloqueia: até a cor chegar (ou se
 * ela não puder ser lida) o hero usa o gradiente neutro do CSS.
 *
 * A URL da capa pode carregar credencial do provedor: ela NUNCA vai para
 * log, erro ou tela (FR-024) — qualquer falha vira `null` em silêncio.
 */

/** Lado da miniatura lida — 256 pixels bastam para a média e custam nada. */
const SAMPLE_SIZE = 16
const COVER_COLOR_CACHE_MAX = 256

/** Cache da sessão: a mesma capa nunca é lida duas vezes (`null` também fica, para não tentar de novo). */
const cache = new Map<string, string | null>()

function remember(url: string, color: string | null): void {
  cache.delete(url)
  cache.set(url, color)
  while (cache.size > COVER_COLOR_CACHE_MAX) cache.delete(cache.keys().next().value as string)
}

/** Só para testes: zera o cache entre casos. */
export function clearCoverColorCache(): void {
  cache.clear()
}

/** Lê a cor de uma imagem já carregada. Pública para teste; `null` em qualquer falha (inclusive CORS). */
export function readCoverColor(image: CanvasImageSource): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    // Imagem de outro domínio sem CORS: `getImageData` lança SecurityError.
    return dominantColorFromPixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data)
  } catch {
    return null
  }
}

/**
 * `panelHosts`: hosts dos painéis cadastrados (`usePanelHosts`); `undefined` = ainda
 * lendo — não arrisca. Capa fora de `isSafeCoverUrl` nem é requisitada (FR-024).
 */
export function useCoverColor(url: string | undefined, panelHosts: readonly string[] | undefined): string | null {
  const [resolved, setResolved] = useState<{ url: string; color: string | null } | null>(null)
  const readable = url !== undefined && panelHosts !== undefined && isSafeCoverUrl(url, panelHosts)

  useEffect(() => {
    if (!url || !readable || cache.has(url)) return
    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    const finish = (color: string | null) => {
      remember(url, color)
      if (!cancelled) setResolved({ url, color })
    }
    image.onload = () => finish(readCoverColor(image))
    image.onerror = () => finish(null)
    image.src = url
    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
    }
  }, [url, readable])

  if (!url || !readable) return null
  if (cache.has(url)) {
    const color = cache.get(url) ?? null
    remember(url, color)
    return color
  }
  return resolved?.url === url ? resolved.color : null
}
