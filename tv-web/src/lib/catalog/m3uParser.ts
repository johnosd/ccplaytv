/**
 * Porta de `api/app/services/m3u_parser.py` para o aparelho.
 *
 * Diferença deliberada em relação ao original: aqui o conteúdo é
 * consumido **em fluxo** (D-002). O backend podia carregar o texto
 * inteiro na memória de um servidor; numa TV isso é a diferença entre
 * funcionar e o app fechar sozinho com uma lista de centenas de milhares
 * de entradas.
 *
 * O parser é uma função pura sobre linhas — não conhece rede nem
 * armazenamento. É isso que permite testá-lo sem Worker e sem IndexedDB,
 * e que mantém o invólucro de Worker trocável (D-003).
 */

export interface ParsedEntry {
  name: string
  url: string
  group?: string
  attributes: Record<string, string>
}

export class HlsManifestDetectedError extends Error {
  constructor() {
    super('Conteúdo é um manifesto de streaming (HLS), não uma playlist de catálogo.')
    this.name = 'HlsManifestDetectedError'
  }
}

export class InvalidPlaylistError extends Error {
  constructor(message = 'Conteúdo não parece uma lista M3U.') {
    super(message)
    this.name = 'InvalidPlaylistError'
  }
}

export class EmptyPlaylistError extends Error {
  constructor(message = 'Lista M3U sem nenhuma entrada válida.') {
    super(message)
    this.name = 'EmptyPlaylistError'
  }
}

/**
 * Tags que só existem em manifestos HLS de verdade (RFC 8216).
 *
 * Deliberadamente NÃO inclui `#EXT-X-SESSION-DATA`: vários painéis
 * Xtream/XUI injetam essa tag de branding em catálogos comuns, e tratá-la
 * como HLS reprovava catálogos reais inteiros. Esse falso positivo já foi
 * corrigido uma vez no backend — a regra é portada com a correção junto,
 * não sem ela.
 */
const HLS_TAG = /^#EXT-X-(STREAM-INF|I-FRAME-STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|ENDLIST|DISCONTINUITY|KEY|MAP|BYTERANGE|PLAYLIST-TYPE)\b/

const ATTRIBUTE = /([\w-]+)="([^"]*)"/g

export function isHlsTagLine(line: string): boolean {
  return HLS_TAG.test(line.trim())
}

/**
 * Separa a parte de duração/atributos do nome do canal.
 *
 * O nome vem depois da primeira vírgula **fora de aspas** — um atributo
 * pode conter vírgula dentro do valor (`group-title="Ação, Aventura"`),
 * e cortar na primeira vírgula bruta quebraria esses casos.
 */
function splitExtinf(payload: string): { head: string; name: string } {
  let inQuotes = false
  for (let i = 0; i < payload.length; i += 1) {
    const char = payload[i]
    if (char === '"') inQuotes = !inQuotes
    else if (char === ',' && !inQuotes) {
      return { head: payload.slice(0, i), name: payload.slice(i + 1).trim() }
    }
  }
  return { head: payload, name: '' }
}

function parseAttributes(head: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  ATTRIBUTE.lastIndex = 0
  let match = ATTRIBUTE.exec(head)
  while (match !== null) {
    attributes[match[1]] = match[2]
    match = ATTRIBUTE.exec(head)
  }
  return attributes
}

export interface ParseTally {
  /** Entradas com `#EXTINF` que não puderam virar item (ex.: sem URL). */
  invalidCount: number
}

/**
 * Interpreta linhas de M3U em fluxo, emitindo uma entrada por vez.
 *
 * Lança `InvalidPlaylistError` se a primeira linha útil não for `#EXTM3U`,
 * e `HlsManifestDetectedError` assim que encontrar uma tag de manifesto.
 *
 * Nota sobre a detecção de HLS: o backend olhava o texto inteiro antes de
 * interpretar qualquer coisa. Em fluxo isso é impossível sem desfazer o
 * ganho de memória, então a tag é detectada **durante** a passagem. O
 * efeito para quem usa é o mesmo: a importação aborta e nada é publicado,
 * porque o pipeline só publica uma geração completa (D-004).
 */
export async function* parseM3uLines(
  lines: AsyncIterable<string>,
  tally: ParseTally = { invalidCount: 0 },
): AsyncGenerator<ParsedEntry> {
  let sawHeader = false
  let pending: { name: string; group?: string; attributes: Record<string, string> } | null = null

  for await (const rawLine of lines) {
    // Remove BOM da primeira linha e espaços das demais.
    const line = rawLine.replace(/^﻿/, '').trim()
    if (line === '') continue

    if (!sawHeader) {
      if (!line.startsWith('#EXTM3U')) {
        throw new InvalidPlaylistError('Conteúdo não começa com #EXTM3U.')
      }
      sawHeader = true
      continue
    }

    if (isHlsTagLine(line)) throw new HlsManifestDetectedError()

    if (line.startsWith('#EXTINF:')) {
      // Um #EXTINF seguido de outro, sem URL no meio, é entrada inválida.
      if (pending !== null) tally.invalidCount += 1
      const { head, name } = splitExtinf(line.slice('#EXTINF:'.length))
      const attributes = parseAttributes(head)
      pending = { name, group: attributes['group-title'] || undefined, attributes }
      continue
    }

    // Outras linhas de diretiva não interessam ao catálogo.
    if (line.startsWith('#')) continue

    if (pending === null) continue // URL solta, sem #EXTINF antes.

    yield {
      name: pending.name || line,
      url: line,
      group: pending.group,
      attributes: pending.attributes,
    }
    pending = null
  }

  // Um #EXTINF no fim do arquivo, sem URL, também é entrada inválida.
  if (pending !== null) tally.invalidCount += 1
  if (!sawHeader) throw new InvalidPlaylistError('Conteúdo vazio.')
}

/** Transforma um texto completo num fluxo de linhas — usado em teste e em listas pequenas. */
export async function* linesFromText(text: string): AsyncGenerator<string> {
  for (const line of text.split(/\r?\n/)) yield line
}

/**
 * Linhas de um corpo de resposta HTTP, sem nunca ter o arquivo inteiro na
 * memória.
 *
 * É o que separa este caminho de um `await response.text()`: uma lista de
 * 300 mil entradas passa dos 50 MB de texto, e materializá-la antes de
 * interpretar já custaria, sozinha, mais memória do que a TV tem para dar
 * (D-002). Aqui o pico é um pedaço de rede mais uma linha.
 *
 * O decodificador é `stream: true` de propósito: um caractere multibyte
 * pode ficar partido entre dois pedaços, e decodificar cada pedaço isolado
 * corromperia acentos exatamente nos nomes de canal em português.
 */
export async function* linesFromResponse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        yield buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer !== '') yield buffer.replace(/\r$/, '')
  } finally {
    // Abandonar o fluxo no meio (cancelamento, erro de escrita) tem que
    // soltar a conexão, ou ela fica pendurada até o app fechar.
    reader.releaseLock()
  }
}

export interface ParseResult {
  entries: ParsedEntry[]
  invalidCount: number
}

/**
 * Conveniência para texto completo. **Materializa tudo em memória** — não
 * usar no caminho de importação de lista grande, que deve consumir
 * `parseM3uLines` diretamente (D-002).
 */
export async function parseM3uText(text: string): Promise<ParseResult> {
  const tally: ParseTally = { invalidCount: 0 }
  const entries: ParsedEntry[] = []
  for await (const entry of parseM3uLines(linesFromText(text), tally)) entries.push(entry)
  if (entries.length === 0) throw new EmptyPlaylistError()
  return { entries, invalidCount: tally.invalidCount }
}
