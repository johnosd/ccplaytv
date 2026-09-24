/**
 * Os tipos de item que uma sessão de reprodução pode receber.
 *
 * Estruturalmente idêntico a `CatalogItemKind` (`lib/catalog/db.ts`) de
 * propósito: esta camada não importa de `lib/catalog` — é a direção única
 * catalog → player que o backlog (item 49) propõe como fronteira do
 * repositório. Um `CatalogItemKind` real satisfaz este tipo por tipagem
 * estrutural, sem exigir conversão nos pontos de chamada.
 */
export type PlayableKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

/**
 * O que é possível fazer com UMA sessão de reprodução.
 *
 * Não é propriedade do motor nem do item: é a interseção dos dois (R0-2). O
 * mesmo AVPlay serve canal ao vivo e filme, e só o filme pode ser buscado.
 * Ver `sdd/specs/011-assistir-filme-retomada/contracts/player-capabilities.md`.
 */
export interface PlayerCapabilities {
  /** Pausar e retomar sem encerrar a sessão. */
  canPause: boolean
  /** Buscar posição — absoluta (`seekTo`) e relativa (`jumpBy`). */
  canSeek: boolean
  /** O motor informa a posição atual desta mídia. */
  reportsPosition: boolean
  /** O motor informa a duração total desta mídia. */
  reportsDuration: boolean
}

/** O que o MOTOR sabe fazer, independente da mídia. Declarado pelo adaptador. */
export type EngineCapabilities = PlayerCapabilities

/** Posição e duração, em milissegundos. `durationMs` ausente = desconhecida. */
export interface PlayerProgress {
  positionMs: number
  durationMs?: number
}

const NONE: PlayerCapabilities = {
  canPause: false,
  canSeek: false,
  reportsPosition: false,
  reportsDuration: false,
}

const FULL: PlayerCapabilities = {
  canPause: true,
  canSeek: true,
  reportsPosition: true,
  reportsDuration: true,
}

/**
 * O que a MÍDIA permite, independente do motor.
 *
 * Transmissão contínua sem janela DVR não tem duração nem posição
 * significativas, e buscá-la é o que a constitution e o critério P02 do guia
 * Samsung 06 proíbem.
 *
 * `series`/`unclassified` devolvem tudo `false` em vez de lançar:
 * `resolvePlaybackUrl` já impede esses tipos de chegar a uma sessão de
 * reprodução (`not_playable_kind`), e uma capacidade negada é sempre um
 * estado válido — a camada de reprodução não é o lugar de descobrir que um
 * item não é reproduzível.
 */
export function mediaCapabilities(kind: PlayableKind): PlayerCapabilities {
  switch (kind) {
    case 'movie':
    case 'episode':
      return FULL
    case 'channel':
    case 'series':
    case 'unclassified':
      return NONE
  }
}

/**
 * Interseção campo a campo. Qualquer outra regra — por exemplo "se o motor
 * sabe buscar, ofereça busca" independente da mídia — viola FR-003.
 */
export function resolveCapabilities(
  engine: EngineCapabilities,
  kind: PlayableKind,
): PlayerCapabilities {
  const media = mediaCapabilities(kind)
  return {
    canPause: engine.canPause && media.canPause,
    canSeek: engine.canSeek && media.canSeek,
    reportsPosition: engine.reportsPosition && media.reportsPosition,
    reportsDuration: engine.reportsDuration && media.reportsDuration,
  }
}
