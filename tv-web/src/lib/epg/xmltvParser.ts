/**
 * Leitura incremental de XMLTV (feature 030, `logic/xmltv-parse.md`).
 *
 * Função pura sobre pedaços de texto — não conhece rede, gzip nem
 * armazenamento, pelo mesmo motivo de `m3uParser.ts`: testável sem Worker
 * nem IndexedDB. **Sem `DOMParser`**: ele não existe dentro de Web Worker,
 * que é onde isto roda na TV.
 */
import type { EpgProgramInput, EpgWindow } from './types'

const TIME_PATTERN = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/

/**
 * `"YYYYMMDDhhmmss +hhmm"` → epoch ms. Sem fuso declarado = UTC (edge case
 * da spec). Formato ilegível → `undefined`, nunca `NaN`.
 */
export function parseXmltvTime(raw: string): number | undefined {
  const match = TIME_PATTERN.exec(raw)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second, sign, offsetHours, offsetMinutes] = match
  const m = Number(month)
  const d = Number(day)
  const h = Number(hour)
  const min = Number(minute)
  const s = second === undefined ? 0 : Number(second)
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return undefined

  const utc = Date.UTC(Number(year), m - 1, d, h, min, s)
  if (!Number.isFinite(utc)) return undefined
  if (sign === undefined) return utc
  const offsetMs = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000
  return sign === '+' ? utc - offsetMs : utc + offsetMs
}

const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function parseAttributes(openTag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  ATTRIBUTE.lastIndex = 0
  let match = ATTRIBUTE.exec(openTag)
  while (match !== null) {
    attributes[match[1]] = match[2] ?? match[3] ?? ''
    match = ATTRIBUTE.exec(openTag)
  }
  return attributes
}

const ENTITY = /&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi

/** Uma passada só: `&amp;lt;` vira `&lt;`, nunca `<` (nada é decodificado duas vezes). */
function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    const lower = body.toLowerCase()
    switch (lower) {
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      case 'amp':
        return '&'
    }
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10)
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
    try {
      return String.fromCodePoint(code)
    } catch {
      return whole
    }
  })
}

const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/

function textOf(raw: string): string {
  const cdata = CDATA.exec(raw)
  return cdata ? cdata[1].trim() : decodeEntities(raw).trim()
}

const TITLE = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/
const DESC = /<desc(?:\s[^>]*)?>([\s\S]*?)<\/desc>/

const OPEN = '<programme'
const CLOSE = '</programme>'

/** Um `<programme>` completo (abertura + conteúdo) → programa, ou `undefined` se não servir (FR-030). */
function parseProgramme(openTag: string, inner: string): EpgProgramInput | undefined {
  const attributes = parseAttributes(openTag)
  // `channel=""` existe no XMLTV real (research R2/R-004): nunca vira chave "".
  const channelKey = decodeEntities(attributes.channel ?? '').trim()
  if (channelKey === '') return undefined

  const start = parseXmltvTime(attributes.start ?? '')
  const end = parseXmltvTime(attributes.stop ?? '')
  if (start === undefined || end === undefined || end <= start) return undefined

  const titleMatch = TITLE.exec(inner)
  const title = titleMatch ? textOf(titleMatch[1]) : ''
  if (title === '') return undefined

  const descMatch = DESC.exec(inner)
  const description = descMatch ? textOf(descMatch[1]) : ''

  const program: EpgProgramInput = { channelKey, start, end, title }
  if (description !== '') program.description = description
  return program
}

/** Posição de um `<programme` de verdade (e não `<programmeX`) a partir de `from`, ou -1. */
function indexOfProgramme(buffer: string, from: number): number {
  let i = buffer.indexOf(OPEN, from)
  while (i >= 0) {
    const next = buffer[i + OPEN.length]
    if (next === undefined) return i // pode estar partido — o chamador espera mais texto
    if (next === ' ' || next === '>' || next === '/' || next === '\t' || next === '\n' || next === '\r') return i
    i = buffer.indexOf(OPEN, i + OPEN.length)
  }
  return -1
}

/**
 * Emite um programa por `<programme>` completo, na ordem do arquivo, só os
 * que se sobrepõem a `window` (FR-004) e têm título não vazio (FR-030). Um
 * elemento partido entre dois pedaços nunca se perde.
 */
export async function* parseXmltv(
  chunks: AsyncIterable<string>,
  window: EpgWindow,
): AsyncGenerator<EpgProgramInput> {
  let buffer = ''

  for await (const chunk of chunks) {
    buffer += chunk

    for (;;) {
      const i = indexOfProgramme(buffer, 0)
      if (i < 0) {
        // Guarda só o final que pode ser o começo de um `<programme` partido.
        buffer = buffer.slice(-(OPEN.length - 1))
        break
      }
      const tagEnd = buffer.indexOf('>', i)
      if (tagEnd < 0) {
        buffer = buffer.slice(i)
        break // tag de abertura incompleta: espera o próximo pedaço
      }
      if (buffer[tagEnd - 1] === '/') {
        // `<programme … />`: sem título, nada a emitir — e não pode engolir o
        // `</programme>` do elemento seguinte.
        buffer = buffer.slice(tagEnd + 1)
        continue
      }
      const closeAt = buffer.indexOf(CLOSE, tagEnd)
      if (closeAt < 0) {
        buffer = buffer.slice(i)
        break // elemento incompleto: espera o próximo pedaço
      }

      const program = parseProgramme(buffer.slice(i, tagEnd + 1), buffer.slice(tagEnd + 1, closeAt))
      buffer = buffer.slice(closeAt + CLOSE.length)
      if (program && program.end > window.from && program.start < window.to) yield program
    }
  }
}
