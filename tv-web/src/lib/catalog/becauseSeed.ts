import type { UserStateRecord } from './db'

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

export function pickBecauseSeed(states: readonly UserStateRecord[], options: PickBecauseSeedOptions): BecauseSeed | null {
  void states
  void options
  throw new Error('not implemented')
}
