/**
 * Faixas de áudio/legenda e info técnica do stream (feature 029,
 * `sdd/specs/029-audio-legendas-info-player/logic/faixas-e-legendas.md`).
 *
 * Tudo aqui é o que o MOTOR informa — nunca estimado. Campo ausente =
 * o motor não disse, e a UI não o desenha (FR-005/FR-014).
 *
 * Só funções puras e tipos — nada aqui toca motor, DOM ou React.
 */

export type MediaTrackKind = 'audio' | 'text'

export interface MediaTrack {
  /** Identificador dentro da SESSÃO (índice do motor como string). Não é estável entre sessões. */
  id: string
  kind: MediaTrackKind
  /** Código de idioma como o motor informou (`por`, `pt`, `eng`…). Ausente/`und` = sem idioma. */
  language?: string
  /** Codec como o motor informou (`AAC`, `AC3`…). */
  codec?: string
  /** Número de canais de áudio (2, 6…). */
  channels?: number
  /** Só `true` quando o motor marca a faixa EXPLICITAMENTE como áudio-descrição (FR-011). */
  audioDescription?: boolean
  /**
   * Ativa agora. Para `audio`, vem do motor. Para `text`, a sessão
   * sobrescreve pela própria seleção (o AVPlay não informa a legenda ativa).
   */
  active: boolean
}

/** Uma linha de legenda entregue pelo motor. `text` vazio = apagar a linha atual. */
export interface SubtitleCue {
  text: string
  durationMs: number
}

/** Info técnica lida do motor num instante. Todo campo é opcional (FR-014). */
export interface StreamInfo {
  width?: number
  height?: number
  videoCodec?: string
  fps?: number
  bitrateKbps?: number
  bufferMs?: number
  protocol?: string
}

/**
 * Escolha de faixas que atravessa itens da mesma sequência (FR-021) —
 * por IDIOMA, nunca por id (ids são por sessão).
 * `textLanguage`: `null` = legenda desativada; string = idioma escolhido.
 * `audioLanguage`: `null` = sem preferência (padrão do stream).
 */
export interface TrackChoice {
  audioLanguage: string | null
  textLanguage: string | null
  subtitleDelayMs: number
}

export const DEFAULT_TRACK_CHOICE: TrackChoice = {
  audioLanguage: null,
  textLanguage: null,
  subtitleDelayMs: 0,
}

/** §27.4 do DS V14. Negativos ficam soft disabled em legenda embutida (D-006). */
export const SUBTITLE_DELAYS_MS = [-1000, -500, 0, 500, 1000] as const

/**
 * Tabela explícita, não `Intl.DisplayNames`: o resultado desta varia entre o
 * Chromium 108 da TV e o Node dos testes (logic §2).
 */
const THREE_TO_TWO: Record<string, string> = {
  por: 'pt',
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  fre: 'fr',
  ita: 'it',
  deu: 'de',
  ger: 'de',
  jpn: 'ja',
  kor: 'ko',
  zho: 'zh',
  chi: 'zh',
  rus: 'ru',
  ara: 'ar',
  nld: 'nl',
  dut: 'nl',
  pol: 'pl',
  tur: 'tr',
  hin: 'hi',
}

const LANGUAGE_NAMES: Record<string, string> = {
  pt: 'Português',
  en: 'Inglês',
  es: 'Espanhol',
  fr: 'Francês',
  it: 'Italiano',
  de: 'Alemão',
  ja: 'Japonês',
  ko: 'Coreano',
  zh: 'Chinês',
  ru: 'Russo',
  ar: 'Árabe',
  nl: 'Holandês',
  pl: 'Polonês',
  tr: 'Turco',
  hi: 'Híndi',
}

/**
 * Idiomas oferecidos nas Configurações (feature 041), na ordem da tabela acima
 * — nunca `Intl.DisplayNames`, que varia entre o Chromium da TV e o Node.
 */
export const LANGUAGE_OPTIONS: { code: string; label: string }[] = Object.entries(LANGUAGE_NAMES).map(
  ([code, label]) => ({ code, label }),
)

/** Códigos que significam "sem idioma" (indeterminado, desconhecido, sem conteúdo linguístico…). */
const NO_LANGUAGE = new Set(['', 'und', 'unk', 'mis', 'zxx', 'qaa'])

const CHANNEL_LABELS: Record<number, string> = { 1: 'Mono', 2: 'Estéreo', 6: '5.1', 8: '7.1' }

/** Normaliza `por`/`pt`/`pt-BR` → `pt`, etc. `undefined` para ausente/`und`. Ver logic §2. */
export function normalizeLanguage(code: string | undefined): string | undefined {
  if (code === undefined) return undefined
  const primary = code.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  if (NO_LANGUAGE.has(primary)) return undefined
  return THREE_TO_TWO[primary] ?? primary
}

/** Rótulo legível de uma faixa (logic §2). `ordinal` é a posição 1-based dentro do seu tipo. */
export function trackLabel(track: MediaTrack, ordinal: number): string {
  const language = normalizeLanguage(track.language)
  // Código fora da tabela aparece em maiúsculas: é o que o motor disse, não invenção.
  const base = language ? (LANGUAGE_NAMES[language] ?? language.toUpperCase()) : `Faixa ${ordinal}`
  if (track.kind !== 'audio') return base
  const parts = [base]
  if (track.codec) parts.push(track.codec.toUpperCase())
  if (track.channels !== undefined && track.channels > 0) {
    parts.push(CHANNEL_LABELS[track.channels] ?? `${track.channels} canais`)
  }
  return parts.join(' • ')
}

/**
 * Rótulos de uma lista de faixas, na mesma ordem. Dois rótulos idênticos do
 * mesmo tipo ganham ` • Faixa N` para serem distinguíveis (logic §2).
 */
export function trackLabels(tracks: MediaTrack[]): string[] {
  const ordinals: Record<MediaTrackKind, number> = { audio: 0, text: 0 }
  const entries = tracks.map((track) => {
    ordinals[track.kind] += 1
    const ordinal = ordinals[track.kind]
    return { kind: track.kind, ordinal, label: trackLabel(track, ordinal) }
  })
  const counts = new Map<string, number>()
  for (const { kind, label } of entries) {
    const key = `${kind}|${label}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return entries.map(({ kind, ordinal, label }) =>
    (counts.get(`${kind}|${label}`) ?? 0) > 1 ? `${label} • Faixa ${ordinal}` : label,
  )
}

/**
 * Qual faixa reaplicar num item novo a partir da escolha anterior (logic §4).
 * `audioId`: `undefined` = não mexer (padrão do stream).
 * `textId`: `null` = desativar; `undefined` nunca é devolvido para texto.
 */
export function pickTracksForChoice(
  tracks: MediaTrack[],
  choice: TrackChoice,
): { audioId: string | undefined; textId: string | null } {
  const audioId =
    choice.audioLanguage === null
      ? undefined
      : tracks.find(
          (t) =>
            t.kind === 'audio' && !t.audioDescription && normalizeLanguage(t.language) === choice.audioLanguage,
        )?.id
  const textId =
    choice.textLanguage === null
      ? null
      : (tracks.find((t) => t.kind === 'text' && normalizeLanguage(t.language) === choice.textLanguage)?.id ?? null)
  return { audioId, textId }
}
