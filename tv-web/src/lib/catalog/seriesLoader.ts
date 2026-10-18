/**
 * Obtenção sob demanda dos episódios de uma série (feature 012,
 * `contracts/series-episodes.md` §2). Gêmeo de `categoryLoader.ts`
 * (feature 010), mesma disciplina — só que por série, não por categoria.
 *
 * Regras invioláveis (mesmas do contrato de categoria, D-005):
 *
 * 1. Só é chamada na **entrada** do detalhe da série, nunca ao focar o
 *    cartão.
 * 2. Série cuja categoria é `eager` (M3U/Modo limitado) nunca toca rede —
 *    os episódios já vieram inteiros na importação.
 * 3. Chamadas concorrentes para a mesma série compartilham **uma**
 *    obtenção só (`inFlight`).
 * 4. Falha nunca apaga episódios já gravados.
 * 5. Erro sai como desfecho (`failed`/`stale-served`), nunca como mensagem
 *    de rede — a mensagem crua carrega a URL com credencial (FR-023).
 * 6. Nenhum episódio gravado guarda URL (D-004) — resolvida na hora por
 *    `resolvePlaybackUrl`, como filme e canal.
 */

import { recordSeriesDiagnostic } from '../diagnostics/seriesDiagnostics'
import { db, type CatalogDb, type CatalogRecord } from './db'
import { activeGeneration, getCategory, getChannel, StorageFullError, storeSeriesEpisodes } from './catalogRepository'
import { isCategoryFresh } from './freshness'
import { readCredential } from './sourceRepository'
import { fetchSeriesDetail, type XtreamEpisode } from './xtreamConnector'
import { normalizeSeriesInfo } from '../metadata/providerMetadata'
import { storeProviderMetadata } from '../metadata/titleMetadataStore'
import { makeRoomFor, touchCategory } from './storageBudget'

export type SeriesFetchOutcome = 'fresh' | 'fetched' | 'stale-served' | 'failed'

export interface EnsureSeriesEpisodesResult {
  outcome: SeriesFetchOutcome
  reason?: 'storage_full'
}

export interface EnsureSeriesEpisodesOptions {
  database?: CatalogDb
  now?: () => number
}

/** Buscas em andamento, por id local do registro da série — mesmo padrão de `categoryLoader.ts`. */
const inFlight = new Map<number, Promise<EnsureSeriesEpisodesResult>>()

function toEpisodeRecord(episode: XtreamEpisode): CatalogRecord {
  return {
    // sourceId/generation/kind/seriesId reais entram em `storeSeriesEpisodes`
    // (D-001/D-002) — aqui só os campos próprios do episódio.
    sourceId: '',
    generation: 0,
    kind: 'episode',
    name: episode.name,
    originalName: episode.originalName,
    groupOrder: episode.groupOrder,
    seriesId: episode.seriesId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    providerStreamId: episode.providerStreamId,
    streamExtension: episode.streamExtension,
    // D-004: provedor nunca grava URL de episódio.
    directUrl: undefined,
    // Feature 025: imagem e duração do episódio declaradas pela fonte.
    iconUrl: episode.iconUrl,
    durationSeconds: episode.durationSeconds,
    // Feature 032 (FR-028): sinopse do episódio, quando o provedor a mandou.
    synopsis: episode.synopsis,
  }
}

async function fetchAndStore(
  series: CatalogRecord,
  wasNeverFetched: boolean,
  database: CatalogDb,
  now: number,
): Promise<EnsureSeriesEpisodesResult> {
  recordSeriesDiagnostic('CREDENTIAL_READ', 'loading')
  const credential = await readCredential(series.sourceId, database)
  if (!credential) {
    recordSeriesDiagnostic('CREDENTIAL_READ', 'failed')
    return { outcome: wasNeverFetched ? 'failed' : 'stale-served' }
  }
  recordSeriesDiagnostic('CREDENTIAL_READ')

  const generation = await activeGeneration(series.sourceId, database)
  if (series.categoryId !== undefined) touchCategory(series.categoryId, now, database)
  if (generation === undefined) {
    recordSeriesDiagnostic('GENERATION_READ', 'failed')
    return { outcome: wasNeverFetched ? 'failed' : 'stale-served' }
  }
  recordSeriesDiagnostic('GENERATION_READ')

  let stage: 'EPISODES_FETCH' | 'EPISODES_STORE' = 'EPISODES_FETCH'
  try {
    recordSeriesDiagnostic(stage, 'loading')
    // Feature 032 (D-009): a mesma resposta traz os episódios e o `info` da
    // série — uma requisição só serve às duas coisas.
    const { episodes, info } = await fetchSeriesDetail(
      credential.dns,
      credential.username,
      credential.password,
      series.seriesId as string,
    )
    recordSeriesDiagnostic(stage)
    stage = 'EPISODES_STORE'
    recordSeriesDiagnostic(stage, 'loading')
    const room = await makeRoomFor(series.sourceId, Math.ceil(episodes.length * 60), { database, now, mode: 'entry', protectCategoryId: series.categoryId })
    if (!room.fits) throw new StorageFullError()
    await storeSeriesEpisodes(
      {
        sourceId: series.sourceId,
        generation,
        seriesId: series.seriesId as string,
        seriesRecordId: series.id as number,
      },
      episodes.map(toEpisodeRecord),
      now,
      database,
    )
    recordSeriesDiagnostic(stage)
    // A metadata da série é acessória: gravá-la nunca pode fazer a obtenção
    // dos episódios (o que a tela precisa) virar falha.
    try {
      await storeProviderMetadata(database, series, normalizeSeriesInfo(info).fields, undefined, now)
    } catch {
      // ignorado de propósito: a próxima abertura do detalhe tenta de novo.
    }
    return { outcome: 'fetched' }
  } catch (error) {
    recordSeriesDiagnostic(stage, 'failed', error)
    // Erro sai como desfecho, nunca como mensagem de rede (regra 5): o que
    // aconteceu já não importa aqui, só que não deu certo. Falha nunca
    // apaga episódios já gravados (regra 4) — o disco, se tiver algo,
    // continua servindo.
    return { outcome: wasNeverFetched ? 'failed' : 'stale-served', ...(error instanceof StorageFullError ? { reason: 'storage_full' as const } : {}) }
  }
}

/**
 * Garante que uma série tem episódios utilizáveis, buscando se preciso.
 *
 * Recebe só o id local do registro `kind:'series'` — resolve sozinha se a
 * categoria dele é `eager` (nunca toca rede) ou `on_demand`, sem exigir que
 * quem chama já tenha essa resposta em mãos.
 */
export async function ensureSeriesEpisodes(
  seriesRecordId: number,
  options: EnsureSeriesEpisodesOptions = {},
): Promise<EnsureSeriesEpisodesResult> {
  const database = options.database ?? db
  const now = options.now?.() ?? Date.now()

  const series = await getChannel(seriesRecordId, database)
  if (!series || !series.seriesId) {
    recordSeriesDiagnostic('SERIES_MISSING', 'failed')
    return { outcome: 'failed' }
  }

  const category = series.categoryId !== undefined ? await getCategory(series.categoryId, database) : undefined
  // `eager` (legado) e `stored` (feature 014) nunca tocam rede aqui: os
  // episódios chegam junto da série na leitura da própria categoria
  // (`categoryLoader.ts`, D-006) — sempre antes de existir um cartão de
  // série para abrir o detalhe.
  if (category?.fetchMode === 'eager' || category?.fetchMode === 'stored') return { outcome: 'fresh' }
  if (isCategoryFresh(series.episodesFetchedAt, now)) return { outcome: 'fresh' }

  const existing = inFlight.get(seriesRecordId)
  if (existing) return existing

  const wasNeverFetched = series.episodesFetchedAt === undefined
  const promise = fetchAndStore(series, wasNeverFetched, database, now).finally(() => {
    inFlight.delete(seriesRecordId)
  })
  inFlight.set(seriesRecordId, promise)
  return promise
}
