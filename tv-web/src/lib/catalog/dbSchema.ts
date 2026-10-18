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
  // Feature 069: controle remoto/licença separados do catálogo e dos PINs existentes.
  db.version(22).stores({
    portalDevice: 'id',
    sourceRevisions: 'sourceId',
    portalOperations: 'operationId, sourceId',
    pendingImportOutbox: 'sourceId, operationId, state',
    pendingPortalDeletes: 'deletionId, sourceId, createdAt',
    licenseCache: 'id',
  })
  // Feature 071: teste de 7 dias contado no aparelho (registro único `trial`). Tabela nova, sem .upgrade():
  // a herança do início de uma licença de teste já verificada acontece em `ensureLocalTrial`.
  db.version(23).stores({
    localTrial: 'id',
  })
  // Feature 071: fila de envio TV → site (última revisão aceita pelo serviço, por lista). Tabela nova, sem .upgrade():
  // vazia = nada enviado ainda, então o primeiro Atualizar sobe todas as listas (FR-010).
  db.version(24).stores({
    sourceUploads: 'sourceId',
  })
  // Feature 072: dados restaurados de uma lista que ainda não voltou à TV; aplicados quando ela voltar e descartados
  // em `expiresAt` (5 dias). Tabela nova, sem .upgrade().
  db.version(25).stores({
    pendingRestore: 'sourceId, expiresAt',
  })
  // Feature 082: catálogo e guia comprimidos em pedaços (a TV dá 80 MiB fixos e não comprime o que grava). Tabelas
  // novas, sem .upgrade(): o formato antigo continua legível e é convertido em segundo plano. Acesso em `chunkTables.ts`.
  db.version(26).stores({
    categoryChunks: '[categoryId+chunk], [sourceId+generation]',
    epgChunks: '[sourceId+generation+channelKey], [sourceId+generation]',
  })
}
