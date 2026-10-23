/**
 * Passo `integrations` do Atualizar: chave TMDB (feature 077) e chaves de legenda (feature 091) pedidas pelo portal.
 * Os dois são **independentes** — a falha de um (rede, fornecedor) nunca impede o outro; o primeiro erro sobe depois que
 * os dois tentaram, para o agente avisar `integrations_failed` sem derrubar o snapshot. `only: 'subtitles'` (Atualizar da
 * seção Legendas) pula a TMDB.
 */
import type { CatalogDb } from '../catalog/db'
import type { PortalConnection } from './portalConnection'
import { createSubtitleKeysRemoteStep } from './subtitleKeysRemote'
import { createTmdbRemoteStep } from './tmdbRemote'

export function createIntegrationSteps(database: CatalogDb, connection: PortalConnection) {
  const tmdb = createTmdbRemoteStep(database, connection)
  const subtitles = createSubtitleKeysRemoteStep(database, connection)
  return async (signal: AbortSignal, only?: 'subtitles'): Promise<void> => {
    const failures: unknown[] = []
    const attempt = async (step: (abort: AbortSignal) => Promise<unknown>) => {
      try {
        await step(signal)
      } catch (error) {
        signal.throwIfAborted()
        failures.push(error)
      }
    }
    if (only !== 'subtitles') await attempt(tmdb)
    await attempt(subtitles)
    if (failures.length > 0) throw failures[0]
  }
}
