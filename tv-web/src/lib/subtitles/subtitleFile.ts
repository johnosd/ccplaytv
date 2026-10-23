/**
 * Leitura de um arquivo de legenda SRT/WebVTT em falas com tempo (feature 090, `logic/legenda-externa.md` §1).
 * Função pura — sem DOM: o texto nunca passa por `innerHTML`/`DOMParser`.
 */

export interface ExternalCue {
  startMs: number
  endMs: number
  /** Texto puro: marcação removida, quebras de linha preservadas como `\n`. */
  text: string
}

/** O arquivo não tem nenhuma fala utilizável (vazio, formato desconhecido, só blocos inválidos). */
export class SubtitleFileError extends Error {
  constructor() {
    super('unreadable')
  }
}

/** Blocos de metadados do WebVTT: não são falas. */
const VTT_META = /^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/

/** `HH:MM:SS,mmm`, `HH:MM:SS.mmm` ou `MM:SS.mmm` (forma curta do WebVTT). */
const TIME = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

function parseTime(raw: string): number | null {
  const match = TIME.exec(raw.trim())
  if (!match) return null
  const [, hours, minutes, seconds, fraction] = match
  const ms = Number(fraction.padEnd(3, '0'))
  return ((Number(hours ?? 0) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + ms
}

/** Tags somem (o conteúdo fica), blocos ASS `{\…}` somem, só as entidades mais comuns são decodificadas. */
function plainText(lines: string[]): string {
  const cleaned = lines.map((line) =>
    line
      .replace(/<[^>]*>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
      .trim(),
  )
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') cleaned.pop()
  while (cleaned.length > 0 && cleaned[0] === '') cleaned.shift()
  return cleaned.join('\n')
}

function parseBlock(block: string): ExternalCue | null {
  const lines = block.split('\n')
  if (VTT_META.test(lines[0] ?? '')) return null
  const timing = lines.findIndex((line) => line.includes('-->'))
  if (timing === -1) return null
  const [left, right = ''] = lines[timing].split('-->')
  // Configurações do WebVTT depois do segundo tempo (`align:start`…) ficam de fora.
  const startMs = parseTime(left)
  const endMs = parseTime(right.trim().split(/\s+/)[0] ?? '')
  if (startMs === null || endMs === null || endMs <= startMs) return null
  const text = plainText(lines.slice(timing + 1))
  return text === '' ? null : { startMs, endMs, text }
}

export function parseSubtitleFile(text: string): ExternalCue[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const cues: ExternalCue[] = []
  for (const block of normalized.split(/\n[ \t]*\n+/)) {
    const cue = parseBlock(block.replace(/^\n+/, ''))
    if (cue) cues.push(cue)
  }
  if (cues.length === 0) throw new SubtitleFileError()
  // `sort` é estável: falas no mesmo instante mantêm a ordem do arquivo.
  return cues.sort((a, b) => a.startMs - b.startMs)
}
