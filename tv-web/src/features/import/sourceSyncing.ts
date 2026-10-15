/**
 * "Sincronizando" por lista (feature 034, FR-015, `logic/conta-da-fonte.md` §6):
 * um store em memória, no mesmo padrão de `useEpgSyncing`, alimentado pelo
 * início e pelo fim de cada importação. **Nunca persistido** — "Sincronizando"
 * só existe enquanto a execução existe (um app que fechou no meio não pode
 * voltar dizendo que ainda sincroniza).
 *
 * Contador por lista, não booleano: duas importações da mesma lista que se
 * sobrepõem (repetir uma que acabou de falhar) não podem apagar o estado uma da
 * outra.
 */

const counts = new Map<string, number>()
const changeListeners = new Set<() => void>()
const finishedListeners = new Set<(sourceId: string) => void>()

function emitChange(): void {
  for (const listener of changeListeners) listener()
}

/** A importação desta lista começou. */
export function beginSourceSync(sourceId: string): void {
  counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
  emitChange()
}

/** A importação terminou (sucesso, falha ou cancelamento). Chamar a mais é inofensivo. */
export function endSourceSync(sourceId: string): void {
  const next = (counts.get(sourceId) ?? 0) - 1
  if (next > 0) counts.set(sourceId, next)
  else counts.delete(sourceId)
  emitChange()
  for (const listener of finishedListeners) listener(sourceId)
}

export function isSourceSyncing(sourceId: string): boolean {
  return (counts.get(sourceId) ?? 0) > 0
}

/** Para `useSyncExternalStore`: avisa quando alguma lista começa ou termina de sincronizar. */
export function subscribeSourceSyncing(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

/**
 * Avisa o fim de cada importação — a raiz do app relê `['sources']` (a conta e
 * o estado acabaram de mudar) e as contagens, igual ao fim da sincronização de EPG.
 */
export function onSourceSyncFinished(listener: (sourceId: string) => void): () => void {
  finishedListeners.add(listener)
  return () => {
    finishedListeners.delete(listener)
  }
}
