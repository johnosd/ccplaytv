import Dexie, { type EntityTable } from 'dexie'
import type { RadioCountry, RadioStation } from './radioTypes'
import type { RadioFavorite } from './radioFavorites'

/**
 * Banco próprio da Rádio (feature 074, D-004; `data-model.md` §1). Separado do catálogo (`ccplaytv`) de propósito: não
 * pertence a nenhuma lista, não entra no backup de uso (ADR-017) e nenhuma migração do catálogo o toca.
 */
export const RADIO_DB_NAME = 'ccplay-radio'

/** `key` = `countries` (com `countries`) ou `stations:<entrada>` (com `stations`). Um tipo só: o Dexie não tipa uniões. */
export interface DirectoryCacheRecord {
  key: string
  fetchedAt: number
  countries?: RadioCountry[]
  stations?: RadioStation[]
}

export class RadioDb extends Dexie {
  favorites!: EntityTable<RadioFavorite, 'id'>
  directoryCache!: EntityTable<DirectoryCacheRecord, 'key'>

  constructor(name = RADIO_DB_NAME) {
    super(name, { chromeTransactionDurability: 'relaxed' })
    this.version(1).stores({
      favorites: 'id, favoritedAt',
      directoryCache: 'key',
    })
  }
}

export const radioDb = new RadioDb()
