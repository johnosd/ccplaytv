/**
 * Hero do Início (feature 026, US1 — FR-002..FR-006). Decide, só com o que
 * já está no aparelho, qual item o hero mostra e o que a ação primária faz.
 *
 * Nunca toca rede: não chama `ensureSeriesEpisodes` nem nada do provedor —
 * uma série favorita cujos episódios nunca foram lidos abre o detalhe em vez
 * de reproduzir (FR-006). Regras completas em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/logic/hero-home.md`.
 */

import { db, type CatalogDb, type CatalogRecord } from './db'

/**
 * O que OK na ação primária do hero faz.
 *
 * `play`: reproduz `itemId` (id local do registro — filme ou EPISÓDIO, nunca
 * a série) por cima do Início. `startAtMs` indefinido = começa do início (o
 * motor decide); `resume` decide o rótulo ("Continuar" × "Assistir").
 *
 * `open-detail`: série sem nenhum episódio conhecido no aparelho — abre o
 * detalhe da série (FR-006), nunca tenta reproduzir.
 */
export type HeroPrimary =
  | { type: 'play'; itemId: string; title: string; startAtMs: number | undefined; resume: boolean }
  | { type: 'open-detail' }

/**
 * `record` é sempre um filme ou uma SÉRIE — um episódio em andamento vira a
 * série-pai (mesma regra de `resolveContinueWatching`, feature 019); o
 * episódio só aparece em `primary.itemId`.
 */
export type HomeHero =
  | { kind: 'continue'; record: CatalogRecord; primary: HeroPrimary }
  | { kind: 'favorite'; record: CatalogRecord; primary: HeroPrimary }
  | { kind: 'welcome' }

/**
 * Cadeia de preferência (FR-002): 1º item de "Continuar assistindo" que
 * resolve no catálogo ativo → senão 1º favorito (filme ou série, mais
 * recente primeiro) que resolve → senão boas-vindas.
 */
export async function loadHomeHero(sourceId: string, database: CatalogDb = db): Promise<HomeHero> {
  void sourceId
  void database
  throw new Error('not implemented')
}
