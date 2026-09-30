import type { TrailerVideoRef } from '../catalog/db'

/**
 * Candidatos a trailer de um título (feature 033,
 * `sdd/specs/033-trailers-filmes-series/logic/candidatos-de-trailer.md`).
 * Funções puras: sem rede, sem banco, sem React.
 */

export type { TrailerVideoRef }

export interface TrailerCandidate extends TrailerVideoRef {
  origin: 'provider' | 'tmdb'
}

/** Nunca mais que isto na lista final (a feature só usa os dois primeiros). */
export const MAX_TRAILER_CANDIDATES = 5

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Id de vídeo do YouTube bem formado — a única coisa que chega à página-ponte (FR-010). */
export function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_VIDEO_ID.test(value)
}

/**
 * `videos` do detalhe do TMDB (`append_to_response=videos`) → referências.
 * Só `site === 'YouTube'`, `type` Trailer/Teaser e id válido; o resto é
 * descartado (making-of, clipe, Vimeo…). Ordem da entrada preservada.
 */
export function trailerRefsFromTmdbVideos(raw: unknown): TrailerVideoRef[] {
  if (typeof raw !== 'object' || raw === null) return []
  const results = (raw as { results?: unknown }).results
  if (!Array.isArray(results)) return []

  const refs: TrailerVideoRef[] = []
  for (const item of results) {
    if (typeof item !== 'object' || item === null) continue
    const video = item as Record<string, unknown>
    if (video.site !== 'YouTube') continue
    const kind = video.type === 'Trailer' ? 'trailer' : video.type === 'Teaser' ? 'teaser' : null
    if (kind === null || !isYoutubeVideoId(video.key)) continue

    const ref: TrailerVideoRef = { videoId: video.key, kind }
    if (typeof video.iso_639_1 === 'string' && video.iso_639_1 !== '') ref.language = video.iso_639_1
    if (typeof video.official === 'boolean') ref.official = video.official
    refs.push(ref)
  }
  return refs
}

/**
 * Menor = melhor. `Array.prototype.sort` é estável, então o empate mantém a ordem do TMDB.
 * Oficial vem ANTES do idioma (R-012): no TMDB, dublagens em português costumam ser
 * reenvios de canais agregadores, cheios de anúncio; o oficial da distribuidora é o
 * que mais se parece com "o trailer" do título.
 */
function tmdbRank(ref: TrailerVideoRef): [number, number, number] {
  return [ref.kind === 'trailer' ? 0 : 1, ref.official === true ? 0 : 1, ref.language === 'pt' ? 0 : 1]
}

function compareTmdb(a: TrailerVideoRef, b: TrailerVideoRef): number {
  const ra = tmdbRank(a)
  const rb = tmdbRank(b)
  for (let i = 0; i < ra.length; i += 1) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i]
  }
  return 0
}

/**
 * Lista final, na ordem de preferência: o do provedor primeiro (se válido),
 * depois os do TMDB ordenados (trailer > teaser; português > outro idioma;
 * oficial > não oficial/desconhecido; empate mantém a ordem da fonte), sem
 * repetir `videoId`, no máximo `MAX_TRAILER_CANDIDATES`.
 */
export function buildTrailerCandidates(
  provider: readonly TrailerVideoRef[] | undefined,
  tmdb: readonly TrailerVideoRef[] | undefined,
): TrailerCandidate[] {
  const ordered: TrailerCandidate[] = [
    ...(provider ?? []).filter((ref) => isYoutubeVideoId(ref.videoId)).map((ref) => ({ ...ref, origin: 'provider' as const })),
    ...(tmdb ?? [])
      .filter((ref) => isYoutubeVideoId(ref.videoId))
      .sort(compareTmdb)
      .map((ref) => ({ ...ref, origin: 'tmdb' as const })),
  ]

  const seen = new Set<string>()
  const unique: TrailerCandidate[] = []
  for (const candidate of ordered) {
    if (seen.has(candidate.videoId)) continue
    seen.add(candidate.videoId)
    unique.push(candidate)
  }
  return unique.slice(0, MAX_TRAILER_CANDIDATES)
}

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(code)
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1)
  } catch {
    // código de idioma malformado: cai no fallback
  }
  return code.toLocaleUpperCase('pt-BR')
}

/**
 * Rótulo do botão disponível (FR-007): "▶ Trailer" para trailer em português
 * ou de idioma desconhecido; senão tipo e idioma ("▶ Trailer · Inglês",
 * "▶ Teaser", "▶ Teaser · Inglês"). Teaser nunca vira "Trailer".
 */
export function trailerButtonLabel(candidate: TrailerCandidate): string {
  const base = candidate.kind === 'teaser' ? '▶ Teaser' : '▶ Trailer'
  const { language } = candidate
  if (!language || language === 'pt') return base
  return `${base} · ${languageName(language)}`
}
