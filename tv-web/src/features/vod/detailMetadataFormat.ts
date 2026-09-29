import type { MetadataOrigin, TitleMetadataView } from '../../lib/metadata/types'

/**
 * Regras puras de apresentação da metadata do detalhe (feature 032). Ficam
 * fora de `DetailMetadata.tsx` para aquele arquivo exportar só componentes.
 */

/**
 * A sinopse só ganha "Ver mais" acima deste comprimento (D-007). Regra
 * determinística por caracteres, não por medição de layout: jsdom não mede
 * e a TV mede diferente do navegador — a mesma sinopse nunca pode aparecer
 * com e sem o botão conforme o ambiente.
 */
export const SYNOPSIS_PREVIEW_CHARS = 220

export function isSynopsisTruncated(text: string): boolean {
  return text.length > SYNOPSIS_PREVIEW_CHARS
}

/**
 * `6631` (01:50:31) → "1 h 50 min"; menos de uma hora → "45 min". Minutos
 * truncados, como um relógio: arredondar faria 01:50:31 virar "1 h 51 min".
 * Sempre pelo menos "1 min" quando há duração.
 */
export function formatDurationMinutes(seconds: number): string {
  const totalMinutes = Math.max(1, Math.floor(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${totalMinutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

/**
 * "A, B; C" → `['A', 'B', 'C']` — o elenco chega como texto corrido (provedor e
 * TMDB). Sem repetição e sem nome vazio; a ordem declarada é preservada.
 */
export function castNames(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of text.split(/[,;]/)) {
    const name = part.trim()
    if (name !== '' && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

export interface FactRow {
  label: string
  value: string
  origin: MetadataOrigin
}

/**
 * Linhas da aba Detalhes vindas da metadata, na ordem fixa
 * Gênero → Duração → Direção → País → Elenco, só com valor real (FR-003).
 * Série: a duração é por episódio, e diz isso (`logic/detalhe-com-metadata.md` §6).
 */
export function metadataFactRows(view: TitleMetadataView | undefined, perEpisode: boolean): FactRow[] {
  if (!view) return []
  const rows: FactRow[] = []
  if (view.genres) rows.push({ label: 'Gênero', value: view.genres.value, origin: view.genres.origin })
  if (view.durationSeconds) {
    const formatted = formatDurationMinutes(view.durationSeconds.value)
    rows.push({
      label: perEpisode ? 'Duração por episódio' : 'Duração',
      value: perEpisode ? `~${formatted}` : formatted,
      origin: view.durationSeconds.origin,
    })
  }
  if (view.director) rows.push({ label: 'Direção', value: view.director.value, origin: view.director.origin })
  if (view.country) rows.push({ label: 'País', value: view.country.value, origin: view.country.origin })
  if (view.cast) rows.push({ label: 'Elenco', value: view.cast.value, origin: view.cast.origin })
  return rows
}
