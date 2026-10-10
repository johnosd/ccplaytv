/**
 * Migração do PIN único da feature 066 para o PIN por lista (feature 067, FR-024): o PIN único vira o PIN de cada lista
 * que tem ao menos uma categoria bloqueada (explícita ou pela regra do nome adulto); as outras ficam sem PIN; o registro
 * antigo some. Idempotente. Roda dentro do `.upgrade()` da versão 21 (recebe a transação) e aceita o banco aberto nos
 * testes. Regras em `sdd/specs/067-configuracoes-lista-global/logic/pin-por-lista.md` §4.
 *
 * STUB do sdd-plan: assinatura travada pelo teste de contrato; o corpo é do sdd-execute.
 */

import type { Table } from 'dexie'

/** Quem fornece as tabelas: o `CatalogDb` aberto ou a `Transaction` do `.upgrade()` — os dois têm `table(nome)`. */
export interface TableSource {
  table(name: string): Table
}

export async function migrateLegacyPin(source: TableSource): Promise<void> {
  void source
  throw new Error('not implemented')
}
