import type { Dashboard, Operation, SavedConfiguration, Snapshot, Source } from '../api'

/**
 * Estado de uma lista no portal (feature 077, D-004, `logic/shell-responsivo.md` §4). Função pura: a prioridade é
 * operação pendente > operação com problema > presente no snapshot ("Na TV") > salva sem snapshot ("Aguardando a TV").
 * **Reenviar** só com problema, **Cancelar envio** só com pendente; Editar/Excluir ficam no cartão sempre.
 */
export type ListStatus = 'onTv' | 'waiting' | 'error' | 'none'
export interface ListState {
  status: ListStatus
  operation?: Operation
  /** Exclusão enviada ainda não aplicada pela TV: o cartão só mostra o selo. */
  deleting: boolean
  canCancel: boolean
  canResend: boolean
  /** Exclusão que falhou: a pessoa pode tentar de novo. */
  canRetryDelete: boolean
}

const PENDING = new Set(['pending', 'received', 'awaiting_confirmation'])
const PROBLEM = new Set(['error', 'conflict', 'expired'])

function latestOperation(sourceId: string, operations: Operation[]): Operation | undefined {
  return [...operations].filter(item => item.sourceId === sourceId && item.state !== 'cancelled')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
}

export function listStatus(sourceId: string, configuration: SavedConfiguration | undefined, operations: Operation[], snapshot: Snapshot | null): ListState {
  const operation = latestOperation(sourceId, operations)
  const isDelete = operation?.action === 'source.delete'
  const none = { operation, deleting: false, canCancel: false, canResend: false, canRetryDelete: false }
  if (operation && PENDING.has(operation.state)) {
    return { ...none, status: 'waiting', deleting: isDelete, canCancel: !isDelete }
  }
  // A carga do catálogo é assunto da TV: o portal só entrega os dados. O que importa é a TV ter recebido e aplicado.
  if (operation && PROBLEM.has(operation.state)) {
    return { ...none, status: 'error', canResend: !isDelete && !!configuration, canRetryDelete: isDelete }
  }
  if (operation?.state === 'applied' && !isDelete) return { ...none, status: 'onTv' }
  if (snapshot?.sources.some(source => source.id === sourceId)) return { ...none, status: 'onTv' }
  return { ...none, status: configuration ? 'waiting' : 'none' }
}

/** Listas que o portal mostra: as do snapshot da TV mais as guardadas no portal que a TV ainda não conhece. */
export function collectLists(dashboard: Dashboard): Source[] {
  const lists = new Map<string, Source>()
  for (const source of dashboard.snapshot?.sources ?? []) if (['provider_credentials', 'm3u_url'].includes(source.type)) lists.set(source.id, source)
  for (const saved of dashboard.configurations) if (!lists.has(saved.sourceId)) lists.set(saved.sourceId, { id: saved.sourceId, type: saved.type, displayName: saved.displayName })
  return [...lists.values()]
}

/** Revisão esperada de uma lista: a do snapshot, senão a última aplicada. */
export function revisionOf(dashboard: Dashboard, sourceId: string): number {
  return dashboard.snapshot?.revisions.find(item => item.sourceId === sourceId)?.revision
    ?? dashboard.configurations.find(item => item.sourceId === sourceId)?.appliedRevision ?? 0
}

/**
 * Exclusões de listas que já não aparecem em lista alguma **e deram problema** (conflito/erro/vencida): são as únicas que
 * pedem ação (tentar de novo). Uma exclusão em andamento ou já aplicada não é uma lista nem um registro de atividade para
 * a tela de listas: some junto com a lista (o aviso "Exclusão enviada" já disse o próximo passo).
 */
export function orphanDeletions(dashboard: Dashboard, lists: Source[]): Operation[] {
  return dashboard.operations.filter(operation => operation.action === 'source.delete' && PROBLEM.has(operation.state) &&
    !lists.some(list => list.id === operation.sourceId))
}
