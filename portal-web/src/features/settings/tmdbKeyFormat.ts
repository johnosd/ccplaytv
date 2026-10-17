/**
 * Formato da chave TMDB antes de enviar (feature 077, FR-010). Espelha `detectKeyFormat` da TV
 * (`tv-web/src/lib/metadata/tmdbConnector.ts`): v3 = 32 caracteres hexadecimais; v4 = token JWT de três partes
 * (`eyJ…`). Aparar espaços e recusar o resto evita um envio que a TV recusaria; a TV continua sendo a autoridade final.
 * A chave nunca é devolvida num erro: o resultado só diz se o formato serve.
 */
const V3 = /^[0-9a-f]{32}$/i
const V4 = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/
/** Teto do serviço (`TmdbKeyInput`: 16–600 de `[A-Za-z0-9._-]`). */
const SERVICE_SHAPE = /^[A-Za-z0-9._-]{16,600}$/

export type TmdbKeyCheck = { ok: true; key: string; format: 'v3' | 'v4' } | { ok: false }

export function checkTmdbKey(raw: string): TmdbKeyCheck {
  const key = raw.trim()
  const format = V3.test(key) ? 'v3' : V4.test(key) ? 'v4' : undefined
  return format && SERVICE_SHAPE.test(key) ? { ok: true, key, format } : { ok: false }
}
