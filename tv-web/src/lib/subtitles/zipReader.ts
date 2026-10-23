/**
 * Leitor mínimo de ZIP para a chave pessoal do SubDL (feature 090, `logic/legenda-externa.md` §10.3, D-015): a mesma
 * regra de `api/app/portal/subtitle_files.py` em TypeScript — em memória, só nome-base, SRT/WebVTT, teto de entradas e de
 * bytes lidos. Sem dependência nova: diretório central + `store`/`deflate` (via `DecompressionStream('deflate-raw')`).
 */
import { SubtitleError } from './types'

export const MAX_TEXT_BYTES = 1024 * 1024
export const MAX_ZIP_BYTES = 2 * 1024 * 1024
export const MAX_ZIP_ENTRIES = 50
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt']
const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
/** O comentário do final pode ter até 65 535 bytes; o registro fixo tem 22. */
const EOCD_SEARCH = 65_557

interface ZipEntry {
  name: string
  encrypted: boolean
  method: number
  compressedSize: number
  size: number
  localOffset: number
  directory: boolean
}

const unreadable = () => new SubtitleError('unreadable')

/** `S01E03`, `s1e3`, `1x03` — sem casar `S01E031` nem `11x03` (igual ao serviço). */
export function episodePattern(season: number, episode: number): RegExp {
  return new RegExp(`(?<!\\d)(?:s0*${season}\\s*[ex]0*${episode}|0*${season}x0*${episode})(?!\\d)`, 'i')
}

function readEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - EOCD_SEARCH); at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      end = at
      break
    }
  }
  if (end === -1) throw unreadable()
  const count = view.getUint16(end + 10, true)
  const centralOffset = view.getUint32(end + 16, true)
  // ZIP64 (campos saturados) e vários discos: fora do que um arquivo de legenda precisa.
  if (count === 0xffff || centralOffset === 0xffffffff || view.getUint16(end + 4, true) !== 0) throw unreadable()
  if (count > MAX_ZIP_ENTRIES) throw unreadable()

  const entries: ZipEntry[] = []
  let at = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) throw unreadable()
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    if (at + 46 + nameLength > bytes.length) throw unreadable()
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    entries.push({
      name,
      encrypted: (view.getUint16(at + 8, true) & 0x1) !== 0,
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      localOffset: view.getUint32(at + 42, true),
      directory: name.endsWith('/'),
    })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Lê com contador real: o tamanho declarado no ZIP pode mentir (anti-bomba). */
async function inflateLimited(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      void reader.cancel().catch(() => {})
      throw unreadable()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.size > MAX_TEXT_BYTES || entry.compressedSize > MAX_ZIP_BYTES) throw unreadable()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const at = entry.localOffset
  if (at + 30 > bytes.length || view.getUint32(at, true) !== LOCAL) throw unreadable()
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (data.length !== entry.compressedSize) throw unreadable()
  if (entry.method === 0) return data
  if (entry.method !== 8) throw unreadable()
  try {
    return await inflateLimited(data, MAX_TEXT_BYTES)
  } catch (error) {
    throw error instanceof SubtitleError ? error : unreadable()
  }
}

/**
 * O arquivo SRT/WebVTT do ZIP. Só o nome-base conta (caminhos `../` nunca são usados). Com vários arquivos e um episódio
 * pedido (pacote de temporada), exige exatamente um arquivo daquele episódio; sem episódio pedido, o maior.
 */
export async function extractSubtitleFromZip(
  data: Uint8Array,
  { season, episode }: { season?: number; episode?: number } = {},
): Promise<Uint8Array> {
  if (data.length > MAX_ZIP_BYTES) throw unreadable()
  const entries = readEntries(data)
  let candidates = entries
    .map((entry) => ({ entry, base: entry.name.replace(/\\/g, '/').split('/').pop() ?? '' }))
    .filter(({ entry, base }) => !entry.directory && !entry.encrypted && SUBTITLE_EXTENSIONS.some((ext) => base.toLowerCase().endsWith(ext)))
  if (candidates.length === 0) throw unreadable()
  if (candidates.length > 1 && season !== undefined && episode !== undefined) {
    const pattern = episodePattern(season, episode)
    candidates = candidates.filter(({ base }) => pattern.test(base))
    if (candidates.length !== 1) throw unreadable()
  }
  const chosen = candidates.reduce((best, item) => (item.entry.size > best.entry.size ? item : best))
  return readEntry(data, chosen.entry)
}

/** UTF-8 (com ou sem BOM); senão cp1252; senão ilegível. Vazio ou > 1 MiB também é ilegível (igual ao serviço). */
export function decodeSubtitleText(raw: Uint8Array): string {
  if (raw.length > MAX_TEXT_BYTES) throw unreadable()
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw).replace(/^﻿/, '')
    if (text.trim() === '') throw unreadable()
    return text
  } catch (error) {
    if (error instanceof SubtitleError) throw error
  }
  // Bytes que o cp1252 do Python recusa (o WHATWG os leria como controle): mesmo veredito nos dois lados.
  if (raw.some((byte) => byte === 0x81 || byte === 0x8d || byte === 0x8f || byte === 0x90 || byte === 0x9d)) throw unreadable()
  const text = new TextDecoder('windows-1252').decode(raw)
  if (text.trim() === '') throw unreadable()
  return text
}
