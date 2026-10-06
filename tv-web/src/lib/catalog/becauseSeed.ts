import type { UserStateRecord } from './db'
import { parseStableId } from './userStateRepository'

/**
 * Semente de "Porque você assistiu X" (feature 060, FR-014 — `sdd/specs/060-home-vitrine-expandida/logic/fileiras-e-dados.md`
 * §2): o título concluído mais recente de uma fonte. Regra pura — quem chama lê os estados e diz a que série pertence cada
 * episódio; nada aqui toca banco nem rede.
 */

/** `any` = Início (filme ou série); `movie`/`series` = a tela de Filmes ou de Séries. */
export type BecauseSeedKind = 'movie' | 'series' | 'any'

export type BecauseSeed = { kind: 'movie'; stableId: string } | { kind: 'series'; seriesId: string }

export interface PickBecauseSeedOptions {
  sourceId: string
  kind: BecauseSeedKind
  /** `seriesId` do episódio deste `stableId`, quando o aparelho conhece o episódio; `undefined` = desconhecido (ignorado). */
  seriesIdOfEpisode: (stableId: string) => string | undefined
}

/**
 * Tirado do ↺ Histórico e não reproduzido depois: não serve de semente (a pessoa disse que não quer isso ali). Quem foi
 * marcado como assistido à mão não tem `lastWatched` e só fica de fora se também foi escondido.
 */
function hiddenFromHistory(state: UserStateRecord): boolean {
  if (state.historyHiddenAt == null) return false
  return !(state.lastWatched != null && state.lastWatched > state.historyHiddenAt)
}

export function pickBecauseSeed(states: readonly UserStateRecord[], options: PickBecauseSeedOptions): BecauseSeed | null {
  const wantsMovie = options.kind === 'movie' || options.kind === 'any'
  const wantsSeries = options.kind === 'series' || options.kind === 'any'

  let best: { completedAt: number; seed: BecauseSeed } | null = null
  for (const state of states) {
    if (state.sourceId !== options.sourceId || state.completedAt == null || hiddenFromHistory(state)) continue
    if (best !== null && state.completedAt <= best.completedAt) continue

    const parts = parseStableId(state.stableId)
    if (parts === null || parts.sourceId !== options.sourceId) continue

    if (parts.kind === 'movie' && wantsMovie) {
      best = { completedAt: state.completedAt, seed: { kind: 'movie', stableId: state.stableId } }
    } else if (parts.kind === 'episode' && wantsSeries) {
      // Episódio sem série conhecida no aparelho: nunca adivinhado (constitution — nada de dado inventado).
      const seriesId = options.seriesIdOfEpisode(state.stableId)
      if (seriesId !== undefined) best = { completedAt: state.completedAt, seed: { kind: 'series', seriesId } }
    }
  }
  return best?.seed ?? null
}
