/**
 * Headers de reprodução declarados por uma entrada M3U (feature 044,
 * `sdd/specs/044-parser-m3u-headers/logic/headers-m3u.md`).
 *
 * Módulo puro: não conhece rede, armazenamento nem log. Os valores são dado
 * sensível (podem carregar token) e só vivem no IndexedDB (ADR-010).
 */

/** Os dois headers que o app guarda; qualquer outro é ignorado sem erro. */
export interface PlaybackHeaders {
  userAgent?: string
  referer?: string
}

/** Maior valor de header aceito, em caracteres (depois de decodificar). Acima disso o header não é guardado. */
const MAX_VALUE_LENGTH = 512

/**
 * Nomes de header HTTP que aparecem em listas reais. Servem **só** para decidir
 * onde um par termina e se um `|` é separador — nunca para guardar: apenas
 * `User-Agent` e `Referer` são guardados (D-001).
 */
const KNOWN_NAME = '(?:user-agent|referer|referrer|origin|cookie|accept-language|accept|authorization|host)='
const STARTS_WITH_KNOWN = new RegExp(`^${KNOWN_NAME}`, 'i')
/** Fronteira entre pares: `&` ou `|` seguido de um nome conhecido — um `&y=2` dentro de um Referer não é fronteira. */
const PAIR_BOUNDARY = new RegExp(`[&|](?=${KNOWN_NAME})`, 'i')

/** Valor sem espaços nas pontas, decodificado se tiver `%` (nunca converte `+`); vazio ou longo demais vira ausência. */
function cleanValue(raw: string): string | undefined {
  let value = raw.trim()
  if (value.includes('%')) {
    try {
      value = decodeURIComponent(value).trim()
    } catch {
      // Sequência `%` inválida: o valor cru é o melhor dado que existe.
    }
  }
  return value === '' || value.length > MAX_VALUE_LENGTH ? undefined : value
}

/**
 * Lê `Nome=valor` separados por `&`/`|` e devolve só User-Agent e Referer.
 * Header repetido: vale o último. Sem nenhum dos dois, `undefined` (nunca `{}`).
 */
export function parseHeaderPairs(text: string): PlaybackHeaders | undefined {
  const headers: PlaybackHeaders = {}
  for (const pair of text.split(PAIR_BOUNDARY)) {
    const equals = pair.indexOf('=')
    if (equals === -1) continue
    const name = pair.slice(0, equals).trim().toLowerCase()
    const value = cleanValue(pair.slice(equals + 1))
    if (value === undefined) continue
    if (name === 'user-agent') headers.userAgent = value
    else if (name === 'referer' || name === 'referrer') headers.referer = value
  }
  return headers.userAgent === undefined && headers.referer === undefined ? undefined : headers
}

/**
 * Separa a URL do sufixo de headers no **primeiro** `|` (`logic` §1).
 * O `|` só é separador quando o que vem depois é vazio ou começa com um nome
 * de header conhecido; senão a linha inteira é a URL (`http://x/a|b.ts`).
 */
export function splitUrlHeaders(line: string): { url: string; headers?: PlaybackHeaders } {
  const bar = line.indexOf('|')
  if (bar === -1) return { url: line }
  const suffix = line.slice(bar + 1).trimStart()
  if (suffix !== '' && !STARTS_WITH_KNOWN.test(suffix)) return { url: line }
  const url = line.slice(0, bar)
  const headers = suffix === '' ? undefined : parseHeaderPairs(suffix)
  return headers ? { url, headers } : { url }
}

const EXTVLCOPT = '#EXTVLCOPT:'
const KODIPROP = '#KODIPROP:'

/**
 * Lê uma linha `#EXTVLCOPT:`/`#KODIPROP:` (`logic` §2). Devolve `null` para
 * qualquer outra linha. `supported: false` = diretiva que o app não usa (ex.:
 * licença DRM): o valor é descartado, nunca guardado nem devolvido.
 */
export function readDirectiveHeaders(line: string): { headers?: PlaybackHeaders; supported: boolean } | null {
  const isVlc = line.startsWith(EXTVLCOPT)
  if (!isVlc && !line.startsWith(KODIPROP)) return null
  const body = line.slice(isVlc ? EXTVLCOPT.length : KODIPROP.length)
  const equals = body.indexOf('=')
  if (equals === -1) return { supported: false }
  const key = body.slice(0, equals).trim().toLowerCase()
  const rawValue = body.slice(equals + 1)

  if (isVlc && key === 'http-user-agent') {
    const userAgent = cleanValue(rawValue)
    return userAgent === undefined ? { supported: true } : { supported: true, headers: { userAgent } }
  }
  if (isVlc && (key === 'http-referrer' || key === 'http-referer')) {
    const referer = cleanValue(rawValue)
    return referer === undefined ? { supported: true } : { supported: true, headers: { referer } }
  }
  if (!isVlc && key === 'inputstream.adaptive.stream_headers') {
    const headers = parseHeaderPairs(rawValue)
    return headers ? { supported: true, headers } : { supported: true }
  }
  return { supported: false }
}
