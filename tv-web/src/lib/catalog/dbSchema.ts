import type Dexie from 'dexie'

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
}
