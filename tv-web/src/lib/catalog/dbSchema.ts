import type Dexie from 'dexie'
import { migrateLegacyPin } from '../parental/pinMigration'

/**
 * Registra as versões mais recentes do catálogo sem concentrar os índices
 * auxiliares no arquivo que declara as entidades.
 */
export function registerLateCatalogSchemas(db: Dexie): void {
  db.version(17).stores({
    networkDiagnostics: 'id',
  })
  db.version(18).stores({
    catalogReadManifests: 'categoryId, sourceId, [sourceId+generation+kind]',
    catalogReadChunks:
      '[categoryId+revision+chunk], [sourceId+generation], [categoryId+revision]',
  })
  db.version(19).stores({
    seriesWatchMembers: '[sourceId+generation+seriesId], [sourceId+generation], *stableIds',
    seriesWatchSummaries: '[sourceId+generation+seriesId], [sourceId+generation]',
  })
  // Feature 066: esconder/bloquear categorias e o PIN parental. Tabelas novas, sem `.upgrade()`.
  // Acesso tipado em `parentalTables.ts` (a classe `CatalogDb` está no teto de linhas, R-009).
  db.version(20).stores({
    categoryPreferences: '[sourceId+kind+matchKey], sourceId',
    parentalPin: 'id',
  })
  // Feature 067: PIN parental por lista. `parentalPin` continua declarada (vazia depois da migração) — o `.upgrade()`
  // passa o PIN único para cada lista com categoria bloqueada antes de qualquer leitura (`logic/pin-por-lista.md` §4).
  db.version(21)
    .stores({ parentalPins: 'sourceId' })
    .upgrade((transaction) => migrateLegacyPin(transaction))
}
