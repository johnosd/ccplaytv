import { db, type CatalogDb } from './db'

/** O que o formulário de edição mostra de uma lista salva — string vazia onde o tipo não tem o campo. */
export interface StoredSourceFields {
  m3uUrl: string
  dns: string
  username: string
  password: string
}

/**
 * **Porta restrita da edição (feature 070, FR-011, constitution 1.10.0).** Devolve os valores
 * guardados no aparelho para a tela de edição os mostrar à própria pessoa, com o olho do formulário.
 * Só `AddSourceScreen` (via `useStoredSourceFields`) chama isto. O resultado vive no estado do
 * formulário e nunca vai a log, query key, `aria-label`, texto de apoio ou erro. Diferente de
 * `readCredential` (`sourceRepository.ts`), não deriva nada da URL M3U: é literalmente o que está salvo.
 */
export async function readSourceFormFields(
  id: string,
  database: CatalogDb = db,
): Promise<StoredSourceFields | undefined> {
  const record = await database.sources.get(id)
  if (!record) return undefined
  return {
    m3uUrl: record.m3uUrl ?? '',
    dns: record.providerDns ?? '',
    username: record.providerUsername ?? '',
    password: record.providerPassword ?? '',
  }
}
