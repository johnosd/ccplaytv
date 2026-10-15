/**
 * Marcação de adulto que a própria lista declara (feature 066, FR-035, D-014): o `is_adult` do painel Xtream, quando
 * vier (canais, filmes ou séries). Só vira `adult: true` — ausente = a lista não disse nada, nunca "não adulto".
 *
 * O campo entra no `CatalogRecord` e no item do conector por augmentation: `db.ts` e `xtreamConnector.ts` estão no
 * teto da catraca (e `db.ts` tem alterações de outra frente em andamento).
 */

import type { CatalogRecord } from './db'

declare module './db' {
  interface CatalogRecord {
    /** A lista marca o item como adulto (`is_adult` do painel). Ausente = não declarado. */
    adult?: boolean
  }
}

declare module './xtreamConnector' {
  interface MappedChannel {
    adult?: boolean
  }
}

/** `is_adult` declarado como verdadeiro pelo painel (`1`, `"1"` ou `true`). */
export function declaresAdult(raw: Record<string, unknown>): boolean {
  return raw.is_adult === 1 || raw.is_adult === '1' || raw.is_adult === true
}

/** Devolve o item mapeado com `adult: true` quando o painel o declara (chave só existe quando verdadeira). */
export function withAdultFlag<T extends { adult?: boolean }>(raw: Record<string, unknown>, mapped: T): T {
  if (declaresAdult(raw)) mapped.adult = true
  return mapped
}

/** Campos da listagem que só existem quando declarados (feature 055 + 066): nota e marcação de adulto. */
export function copyListingFields(
  channel: { providerRating?: number; adult?: boolean },
  record: Pick<CatalogRecord, 'providerRating' | 'adult'>,
): void {
  if (channel.providerRating !== undefined) record.providerRating = channel.providerRating
  if (channel.adult) record.adult = true
}
