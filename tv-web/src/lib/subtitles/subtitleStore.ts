/**
 * Memória local das legendas externas (feature 090, `logic/legenda-externa.md` §6, `data-model.md` §1): uma por
 * idioma por item, no máximo uma ativa, texto em gzip, teto próprio. Nunca fala com a rede.
 *
 * Comprimir e descomprimir acontecem FORA das transações (regra da 082): uma transação do IndexedDB fecha sozinha
 * quando espera algo que não é do próprio banco.
 */
import { gunzipText, gzipText } from '../catalog/blockCodec'
import { db, type CatalogDb } from '../catalog/db'
import { clampExternalDelay } from './delay'
import { externalSubtitles, type ExternalSubtitleRecord } from './subtitleTables'
import { SUBTITLE_LANGUAGES, type StoredExternalSubtitle, type SubtitleLanguage, type SubtitleStorePort } from './types'

/** Teto da tabela inteira (soma de `size`): pequeno, dentro da reserva da 082 (D-008, R-006). */
export const EXTERNAL_SUBTITLES_CAP_BYTES = 2 * 1024 * 1024
export { clampExternalDelay, EXTERNAL_DELAY_LIMIT_MS, EXTERNAL_DELAY_STEP_MS } from './delay'

async function decode(record: ExternalSubtitleRecord): Promise<StoredExternalSubtitle> {
  return {
    stableId: record.stableId,
    sourceId: record.sourceId,
    language: record.language,
    resultId: record.resultId,
    release: record.release,
    delayMs: clampExternalDelay(record.delayMs),
    active: record.active,
    text: await gunzipText(record.bytes),
  }
}

function byLanguage(a: ExternalSubtitleRecord, b: ExternalSubtitleRecord): number {
  return SUBTITLE_LANGUAGES.indexOf(a.language) - SUBTITLE_LANGUAGES.indexOf(b.language)
}

export interface SubtitleStoreOptions {
  capBytes?: number
  now?: () => number
}

export function createSubtitleStore(database: CatalogDb = db, options: SubtitleStoreOptions = {}): Required<SubtitleStorePort> {
  const table = externalSubtitles(database)
  const capBytes = options.capBytes ?? EXTERNAL_SUBTITLES_CAP_BYTES
  const now = options.now ?? Date.now

  /** Marca o uso fora do caminho de quem leu; falhar aqui só atrasa o despejo. */
  function touch(record: ExternalSubtitleRecord) {
    void table.update([record.stableId, record.language], { lastUsedAt: now() }).catch(() => {})
  }

  return {
    async load(stableId) {
      try {
        const rows = await table.where('stableId').equals(stableId).toArray()
        const active = rows.find((row) => row.active)
        if (!active) return null
        touch(active)
        return await decode(active)
      } catch {
        return null
      }
    },

    async list(stableId) {
      try {
        const rows = (await table.where('stableId').equals(stableId).toArray()).sort(byLanguage)
        return await Promise.all(rows.map(decode))
      } catch {
        return []
      }
    },

    async save(entry) {
      try {
        const bytes = await gzipText(entry.text)
        if (bytes.byteLength > capBytes) return false
        const at = now()
        const record: ExternalSubtitleRecord = {
          stableId: entry.stableId,
          sourceId: entry.sourceId,
          language: entry.language,
          resultId: entry.resultId,
          release: entry.release.slice(0, 200),
          delayMs: clampExternalDelay(entry.delayMs),
          active: entry.active,
          bytes,
          size: bytes.byteLength,
          savedAt: at,
          lastUsedAt: at,
        }
        await database.transaction('rw', table, async () => {
          const all = await table.toArray()
          const others = all.filter((row) => !(row.stableId === entry.stableId && row.language === entry.language))
          let total = others.reduce((sum, row) => sum + row.size, 0)
          // Despejo do menos usado, só desta tabela, nunca uma linha do próprio item (D-008).
          const evictable = others
            .filter((row) => row.stableId !== entry.stableId)
            .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
          const evicted: [string, SubtitleLanguage][] = []
          for (const row of evictable) {
            if (total + record.size <= capBytes) break
            total -= row.size
            evicted.push([row.stableId, row.language])
          }
          if (total + record.size > capBytes) throw new Error('subtitle_cap')
          if (evicted.length > 0) await table.bulkDelete(evicted)
          if (record.active) {
            for (const row of others) {
              if (row.stableId === entry.stableId && row.active) {
                await table.update([row.stableId, row.language], { active: false })
              }
            }
          }
          await table.put(record)
        })
        return true
      } catch {
        // Cota cheia, banco fechado ou teto: a legenda vale só nesta sessão (nunca erro para a pessoa).
        return false
      }
    },

    async update(stableId, patch, language) {
      try {
        await database.transaction('rw', table, async () => {
          const rows = await table.where('stableId').equals(stableId).toArray()
          const target = language ? rows.find((row) => row.language === language) : rows.find((row) => row.active)
          if (!target) return
          if (patch.active === true) {
            for (const row of rows) {
              if (row !== target && row.active) await table.update([row.stableId, row.language], { active: false })
            }
          }
          const changes: Partial<ExternalSubtitleRecord> = { lastUsedAt: now() }
          if (patch.active !== undefined) changes.active = patch.active
          if (patch.delayMs !== undefined) changes.delayMs = clampExternalDelay(patch.delayMs)
          await table.update([target.stableId, target.language], changes)
        })
      } catch {
        // Gravar a escolha é melhor esforço: a sessão atual já aplicou.
      }
    },
  }
}
