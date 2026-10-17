/**
 * Entrada numa lista vinda do site cujo catálogo ainda não terminou de carregar (feature 071/A008, estendida na 077):
 * em vez de abrir uma lista vazia, a TV mostra o progresso da importação e só entra quando ela termina.
 *
 * A marca em memória (`remoteImportsInFlight`) só vale enquanto a página que iniciou a importação continua aberta; se a
 * página é recarregada, a marca some e a importação é interrompida. Por isso a decisão também olha o registro durável da
 * importação (`portalTables.imports`): a execução interrompida aparece na tela de progresso, que a reconcilia (passou de 60 s
 * sem sinal = "interrompida", com Tentar novamente) e nunca fica presa num progresso que não avança.
 */
import { db, type CatalogDb } from '../catalog/db'
import { drainRemoteImports, localImportSource, type ImportRemoteSource } from './remoteImportOutbox'
import { remoteImportRunId } from './remoteImportsInFlight'
import { portalTables } from './portalTables'

/** Id da execução a acompanhar na entrada da lista, ou `undefined` se a lista pode ser aberta normalmente. */
export async function resolveRemoteImportEntry(database: CatalogDb, importSource: ImportRemoteSource, sourceId: string): Promise<string | undefined> {
  const live = remoteImportRunId(sourceId)
  if (live) return live
  const pending = await portalTables(database).imports.get(sourceId)
  // Sem registro ou já concluída: nada a acompanhar (o chamador só chega aqui para lista nunca sincronizada).
  if (!pending || pending.state === 'completed') return undefined
  // Importação aceita mas ainda não iniciada nesta página: inicia agora, pelo mesmo caminho do Atualizar (sem rede do portal).
  if (!pending.runId) {
    await drainRemoteImports(database, importSource, sourceId)
    return remoteImportRunId(sourceId) ?? (await portalTables(database).imports.get(sourceId))?.runId
  }
  // Execução já registrada (em andamento, interrompida por recarga ou com erro): a tela de progresso mostra o estado real.
  return pending.runId
}

export const remoteImportRunForEntry = (sourceId: string) => resolveRemoteImportEntry(db, localImportSource(db), sourceId)
