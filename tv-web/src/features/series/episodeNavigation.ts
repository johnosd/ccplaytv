/**
 * Ordenação, agrupamento por temporada e selo de assistido (feature 012,
 * `logic/episodios-autoplay.md` §3/§5). Próximo episódio (§4) chega na
 * Fase US4. Funções puras — sem React, sem banco — consumidas por
 * `SeriesDetailScreen.tsx`.
 */

import type { UserStateRecord } from '../../lib/catalog/db'
import { isResumable } from '../../lib/player/resumePolicy'

// Reexportado: `EpisodeOut` é definido em `catalogApi.ts` (a forma que
// `useSeriesEpisodes` devolve, `data-model.md` §5) — este módulo é
// `features/series/`, e a direção de dependência entre telas passa por
// `features/catalog/` como fachada comum, nunca uma tela importando de
// outra direto (backlog item 49).
export type { EpisodeOut } from '../catalog/catalogApi'
import type { EpisodeOut } from '../catalog/catalogApi'

export interface Season {
  key: string
  label: string
  number: number | null
  episodes: EpisodeOut[]
}

/**
 * Numerados primeiro (por `episode_number` crescente); sem número depois,
 * por id crescente entre si — a ordem em que a fonte declarou (`logic` §3,
 * D-011).
 */
function sortEpisodes(episodes: EpisodeOut[]): EpisodeOut[] {
  return [...episodes].sort((a, b) => {
    if (a.episode_number !== null && b.episode_number !== null) {
      return a.episode_number - b.episode_number
    }
    if (a.episode_number !== null) return -1
    if (b.episode_number !== null) return 1
    return Number(a.id) - Number(b.id)
  })
}

/**
 * Agrupa episódios por temporada, na ordem de exibição (D-011). Temporada
 * sem episódio não existe — é derivada da lista, nunca declarada à parte.
 * `season_number: null` vira um único grupo "Episódios", sempre por
 * último (M3U/Modo limitado sem temporada identificável no nome, D-011).
 */
export function groupBySeason(episodes: EpisodeOut[]): Season[] {
  const bySeason = new Map<number | null, EpisodeOut[]>()
  for (const episode of episodes) {
    const list = bySeason.get(episode.season_number)
    if (list) list.push(episode)
    else bySeason.set(episode.season_number, [episode])
  }

  const numbered = [...bySeason.entries()]
    .filter((entry): entry is [number, EpisodeOut[]] => entry[0] !== null)
    .sort((a, b) => a[0] - b[0])
    .map(([number, list]) => ({
      key: String(number),
      label: `Temporada ${number}`,
      number,
      episodes: sortEpisodes(list),
    }))

  const unnumbered = bySeason.get(null)
  if (!unnumbered) return numbered
  return [...numbered, { key: 'none', label: 'Episódios', number: null, episodes: sortEpisodes(unnumbered) }]
}

/**
 * O próximo episódio depois de `currentId`, na ordem de exibição (`logic`
 * §4, D-010). Atravessa para a temporada seguinte quando `currentId` é o
 * último da atual; sem próxima temporada, não há próximo (FR-016). Nunca
 * consulta rede nem outra série — opera só sobre a lista já carregada
 * (FR-017 por construção).
 */
export function nextEpisode(seasons: Season[], currentId: string): EpisodeOut | null {
  const seasonIndex = seasons.findIndex((season) => season.episodes.some((ep) => ep.id === currentId))
  if (seasonIndex === -1) return null

  const episodeIndex = seasons[seasonIndex].episodes.findIndex((ep) => ep.id === currentId)
  const sameSeason = seasons[seasonIndex].episodes[episodeIndex + 1]
  if (sameSeason) return sameSeason

  return seasons[seasonIndex + 1]?.episodes[0] ?? null
}

export interface EpisodeBadge {
  watched: boolean
  resumeSeconds: number | null
}

export type SeriesPrimary =
  | { kind: 'resume'; episode: EpisodeOut; resumeSeconds: number }
  | { kind: 'start'; episode: EpisodeOut }

/**
 * Ação primária do detalhe de série (feature 025, `logic/detalhe-vod.md`
 * §3): o episódio com retomada mais recente (maior `lastWatched`), senão o
 * 1º episódio da 1ª temporada (ordem de `groupBySeason`). Sem episódio
 * nenhum, `null` — a tela já cobre esse caso com o estado "Episódios ainda
 * não disponíveis" antes de chegar aqui. "Próximo depois do último
 * concluído" não entra (US6/AC1 pede só retomada ou o primeiro).
 */
export function seriesPrimaryAction(
  seasons: Season[],
  stateFor: (episode: EpisodeOut) => UserStateRecord | null,
): SeriesPrimary | null {
  let best: { episode: EpisodeOut; resumeSeconds: number; lastWatched: number } | null = null
  for (const season of seasons) {
    for (const episode of season.episodes) {
      const state = stateFor(episode)
      if (!state || !isResumable(state.progressSeconds)) continue
      const lastWatched = state.lastWatched ?? 0
      if (!best || lastWatched > best.lastWatched) {
        best = { episode, resumeSeconds: state.progressSeconds as number, lastWatched }
      }
    }
  }
  if (best) return { kind: 'resume', episode: best.episode, resumeSeconds: best.resumeSeconds }

  const first = seasons[0]?.episodes[0]
  return first ? { kind: 'start', episode: first } : null
}

/**
 * `T{s}:E{e}` com os dois números; só `E{e}` sem temporada; o nome do
 * episódio quando nem episódio a fonte declarou (`logic/detalhe-vod.md`
 * §3) — nunca "—" nem um número inventado.
 */
export function episodeCode(episode: EpisodeOut): string {
  if (episode.season_number != null && episode.episode_number != null) {
    return `T${episode.season_number}:E${episode.episode_number}`
  }
  if (episode.episode_number != null) return `E${episode.episode_number}`
  return episode.name
}

/**
 * O selo de um episódio a partir do estado do usuário (`logic` §5, D-007).
 * Assistido e retomada convivem: reassistir um episódio concluído mostra
 * os dois — não são estados mutuamente exclusivos.
 */
export function episodeBadge(state: UserStateRecord | null | undefined): EpisodeBadge {
  return {
    watched: state?.completedAt != null,
    resumeSeconds: isResumable(state?.progressSeconds) ? (state?.progressSeconds as number) : null,
  }
}
