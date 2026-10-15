/**
 * Importações vindas do site (feature 071, A008) que ainda correm neste aparelho: sourceId → id da execução. Leitura
 * síncrona para a tela de listas decidir, na entrada, entre o progresso e a lista. Só memória: ao reabrir o app o
 * dreno da outbox reconcilia e registra de novo a execução que continuar viva.
 */
const running = new Map<string, string>()

export function markRemoteImportRunning(sourceId: string, runId: string): void {
  running.set(sourceId, runId)
}

export function clearRemoteImport(sourceId: string, runId: string): void {
  if (running.get(sourceId) === runId) running.delete(sourceId)
}

export function remoteImportRunId(sourceId: string): string | undefined {
  return running.get(sourceId)
}
