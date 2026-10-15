/**
 * Envio TV → site (feature 071, FR-008..FR-010, D-009/D-010): decide pela fila durável (`sourceUploads`), manda em
 * lotes de 10 e só marca a revisão como enviada quando o serviço a aceitou. Para no primeiro erro de rede/serviço;
 * nada é perdido (a fila é a tabela). Credenciais só vão no corpo HTTPS desta rota — nunca em log nem em erro.
 */
import type { CatalogDb } from '../catalog/db'
import type { PortalConnection } from './portalConnection'
import { PortalRequestError } from './portalClient'
import { portalTables, type PortalDeviceRecord } from './portalTables'
import { planSourceUploads, type UploadableSource } from './sourceUploadPlan'

const BATCH = 10
type UploadState = 'stored' | 'unchanged' | 'conflict' | 'gone' | 'invalid'
const ACCEPTED = new Set<UploadState>(['stored', 'unchanged', 'gone'])

/** Marca a revisão como já refletida no serviço (ex.: valor veio do próprio portal e foi aplicado na TV). */
export async function markSourceUploaded(database: CatalogDb, sourceId: string, revision: number) {
  const table = portalTables(database).uploads
  await database.transaction('rw', table, async () => {
    const current = await table.get(sourceId)
    if (!current || current.uploadedRevision < revision) await table.put({ sourceId, uploadedRevision: revision })
  })
}

async function uploadable(database: CatalogDb): Promise<UploadableSource[]> {
  const tables = portalTables(database)
  const [sources, revisions] = await Promise.all([database.sources.toArray(), tables.revisions.toArray()])
  const byId = new Map(revisions.map(row => [row.sourceId, row]))
  const rows: UploadableSource[] = []
  for (const source of sources) {
    const revision = byId.get(source.id)
    if (!revision || revision.tombstone) continue
    if (source.type !== 'm3u_url' && source.type !== 'provider_credentials') continue
    rows.push({ id: source.id, type: source.type, displayName: source.displayName, m3uUrl: source.m3uUrl,
      providerDns: source.providerDns, providerUsername: source.providerUsername, providerPassword: source.providerPassword,
      epgManualUrl: source.epgManualUrl, epgOffsetHours: source.epgOffsetHours, revision: revision.revision })
  }
  return rows
}

/** Esvazia a fila: devolve quantas listas o serviço aceitou. `same` revalida a identidade depois de cada resposta. */
export async function flushSourceUploads(database: CatalogDb, connection: PortalConnection, device: PortalDeviceRecord,
  signal: AbortSignal, same: () => Promise<void>): Promise<number> {
  const tables = portalTables(database)
  const uploaded: Record<string, number> = {}
  for (const row of await tables.uploads.toArray()) uploaded[row.sourceId] = row.uploadedRevision
  const plan = planSourceUploads({ sources: await uploadable(database), uploaded })
  let accepted = 0
  for (let start = 0; start < plan.length; start += BATCH) {
    signal.throwIfAborted()
    const batch = plan.slice(start, start + BATCH)
    const response = await connection.client.request<{ results: { sourceId: string; state: UploadState }[] }>(
      '/portal/v1/device/sources', { bearer: device.bearer, signal, body: { sources: batch.map(({ sourceId, revision, ...input }) => ({
        sourceId, revision, input })) } })
    await same()
    if (!Array.isArray(response?.results)) throw new PortalRequestError('service_unavailable')
    for (const result of response.results) {
      const sent = batch.find(item => item.sourceId === result.sourceId)
      if (!sent || !ACCEPTED.has(result.state)) continue
      await markSourceUploaded(database, sent.sourceId, sent.revision)
      accepted++
    }
  }
  return accepted
}