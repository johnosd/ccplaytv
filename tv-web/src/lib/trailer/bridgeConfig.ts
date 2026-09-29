/**
 * Endereço e protocolo da página-ponte do trailer (feature 033, ADR-012,
 * `sdd/specs/033-trailers-filmes-series/logic/pagina-ponte.md`).
 *
 * A página vive em `bridge/trailer/index.html` na raiz do repositório e é
 * publicada pelo GitHub Pages do próprio repo. O endereço é fixo no build —
 * trocar de hospedagem exige nova versão do app (ADR-012). Não é segredo.
 */
export const TRAILER_BRIDGE_URL = 'https://johnosd.github.io/ccplaytv/trailer/'

export const TRAILER_BRIDGE_ORIGIN = new URL(TRAILER_BRIDGE_URL).origin

export const BRIDGE_PROTOCOL_VERSION = 1

/** A ÚNICA coisa que vai na URL é o id do vídeo (FR-010) — nada de título, fonte ou chave. */
export function trailerBridgeSrc(videoId: string): string {
  const url = new URL(TRAILER_BRIDGE_URL)
  url.searchParams.set('v', videoId)
  return url.href
}

/** Página-ponte → app. Qualquer outra forma é ignorada (FR-011). */
export type BridgeToApp =
  | { source: 'ccplay-trailer'; v: 1; type: 'ready' | 'playing' | 'paused' | 'ended' | 'seeked' | 'api-failed' }
  | { source: 'ccplay-trailer'; v: 1; type: 'error'; code: number }

/** App → página-ponte. */
export type AppToBridge =
  | { source: 'ccplay-app'; v: 1; type: 'toggle' | 'stop' }
  | { source: 'ccplay-app'; v: 1; type: 'seek-by'; seconds: number }

/**
 * Aceita a mensagem só se vier da origem da ponte E da janela do iframe em
 * uso, com a forma exata de `BridgeToApp`; senão `null`.
 */
const SIMPLE_TYPES = new Set(['ready', 'playing', 'paused', 'ended', 'seeked', 'api-failed'])

export function parseBridgeMessage(event: MessageEvent, frame: Window | null): BridgeToApp | null {
  if (frame === null || event.origin !== TRAILER_BRIDGE_ORIGIN || event.source !== frame) return null
  const data: unknown = event.data
  if (typeof data !== 'object' || data === null) return null
  const msg = data as Record<string, unknown>
  if (msg.source !== 'ccplay-trailer' || msg.v !== BRIDGE_PROTOCOL_VERSION) return null

  if (typeof msg.type === 'string' && SIMPLE_TYPES.has(msg.type)) {
    return { source: 'ccplay-trailer', v: 1, type: msg.type as Exclude<BridgeToApp['type'], 'error'> }
  }
  if (msg.type === 'error' && typeof msg.code === 'number' && Number.isFinite(msg.code)) {
    return { source: 'ccplay-trailer', v: 1, type: 'error', code: msg.code }
  }
  return null
}
