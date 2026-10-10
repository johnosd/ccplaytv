/**
 * Migração do PIN único da feature 066 para o PIN por lista (feature 067, FR-024): o PIN único vira o PIN de cada lista
 * que tem ao menos uma categoria bloqueada (explícita ou pela regra do nome adulto); as outras ficam sem PIN; o registro
 * antigo some. Idempotente. Roda dentro do `.upgrade()` da versão 21 (recebe a transação) e aceita o banco aberto nos
 * testes. Regras em `sdd/specs/067-configuracoes-lista-global/logic/pin-por-lista.md` §4.
 *
 * Só importa módulos sem `db.ts` em tempo de execução: `dbSchema.ts` (carregado por `db.ts`) importa este arquivo.
 */

import type { Table } from 'dexie'
import type { CategoryRecord, SourceRecord } from '../catalog/db'
import type { CategoryPreferenceRecord, ParentalListPinRecord, ParentalPinRecord } from '../catalog/parentalTables'
import { isSavedLock } from '../catalog/adultCategory'
import { categoryMatchKey } from '../catalog/structureDiff'

/** Quem fornece as tabelas: o `CatalogDb` aberto ou a `Transaction` do `.upgrade()` — os dois têm `table(nome)`. */
export interface TableSource {
  table(name: string): Table
}

const prefKey = (kind: string, matchKey: string) => `${kind}|${matchKey}`

export async function migrateLegacyPin(source: TableSource): Promise<void> {
  const legacyTable = source.table('parentalPin') as Table<ParentalPinRecord, string>
  const legacy = await legacyTable.get('pin')
  if (!legacy) return

  const pins = source.table('parentalPins') as Table<ParentalListPinRecord, string>
  const sources = (await source.table('sources').toArray()) as SourceRecord[]
  const allPrefs = (await source.table('categoryPreferences').toArray()) as CategoryPreferenceRecord[]
  const allCategories = (await source.table('categories').toArray()) as CategoryRecord[]

  for (const list of sources) {
    const prefs = allPrefs.filter((pref) => pref.sourceId === list.id)
    const byKey = new Map(prefs.map((pref) => [prefKey(pref.kind, pref.matchKey), pref]))
    // Bloqueio explícito vale mesmo fora da geração ativa: protege a categoria quando ela voltar.
    const explicit = prefs.some((pref) => pref.locked === true)
    const locked =
      explicit ||
      allCategories.some(
        (category) =>
          category.sourceId === list.id &&
          category.generation === list.activeGeneration &&
          isSavedLock(true, byKey.get(prefKey(category.kind, categoryMatchKey(category.providerCategoryId, category.name))), category.name),
      )
    if (!locked) continue
    // Mesmo sal e hash: o esquema de hash não muda (D-003), então o PIN que a pessoa conhece continua valendo.
    await pins.put({ sourceId: list.id, salt: legacy.salt, hash: legacy.hash, algorithm: legacy.algorithm, createdAt: legacy.createdAt })
  }
  await legacyTable.delete('pin')
}
