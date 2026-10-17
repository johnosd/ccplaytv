import { describe, expect, it } from 'vitest'
import type { Dashboard, Operation, SavedConfiguration, Snapshot } from '../api'
import { collectLists, listStatus, orphanDeletions, revisionOf } from './listStatus'

const config = (sourceId: string, appliedRevision: number | null = null): SavedConfiguration =>
  ({ sourceId, type: 'm3u_url', displayName: sourceId, configVersion: 'v', appliedRevision, expectedRevision: 0, operationId: null })
const op = (sourceId: string, action: string, state: string, at = '2026-10-16T12:00:00.000Z', importState: string | null = null): Operation =>
  ({ operationId: sourceId + state + at, sourceId, action, state, expectedRevision: 0, createdAt: at, importState, receipt: null })
const snapshot = (...ids: string[]): Snapshot => ({ capturedAt: '2026-10-16T12:00:00.000Z', sources: ids.map(id => ({ id, type: 'm3u_url' as const, displayName: id })), revisions: ids.map(id => ({ sourceId: id, revision: 3 })) })

describe('estado da lista no portal (feature 077)', () => {
  it('no snapshot = Na TV, sem Reenviar nem Cancelar; salva sem snapshot = Aguardando a TV', () => {
    expect(listStatus('a', config('a', 1), [], snapshot('a'))).toMatchObject({ status: 'onTv', canCancel: false, canResend: false, deleting: false })
    expect(listStatus('b', config('b'), [], snapshot('a'))).toMatchObject({ status: 'waiting', canCancel: false, canResend: false })
    expect(listStatus('b', undefined, [], null)).toMatchObject({ status: 'none' })
    expect(listStatus('t', undefined, [], snapshot('t'))).toMatchObject({ status: 'onTv' })
  })

  it('operação pendente vence tudo e só ela oferece Cancelar envio', () => {
    for (const state of ['pending', 'received', 'awaiting_confirmation']) {
      expect(listStatus('a', config('a', 1), [op('a', 'source.update', state)], snapshot('a'))).toMatchObject({ status: 'waiting', canCancel: true, canResend: false })
    }
  })

  it('operação com problema = Erro e só ela oferece Reenviar (exclusão que falhou oferece tentar de novo)', () => {
    for (const state of ['error', 'conflict', 'expired']) {
      expect(listStatus('c', config('c'), [op('c', 'source.update', state)], snapshot())).toMatchObject({ status: 'error', canResend: true, canCancel: false, canRetryDelete: false })
    }
    expect(listStatus('c', config('c', 1), [op('c', 'source.delete', 'conflict')], snapshot('c'))).toMatchObject({ status: 'error', canResend: false, canRetryDelete: true })
    // Sem configuração guardada não há o que reenviar.
    expect(listStatus('c', undefined, [op('c', 'source.update', 'expired')], snapshot())).toMatchObject({ status: 'error', canResend: false })
  })

  it('exclusão pendente = Aguardando a TV, "deleting" e sem Cancelar; cancelada não conta; vale a operação mais recente', () => {
    expect(listStatus('a', config('a', 1), [op('a', 'source.delete', 'pending')], snapshot('a'))).toMatchObject({ status: 'waiting', deleting: true, canCancel: false })
    expect(listStatus('a', config('a', 1), [op('a', 'source.update', 'cancelled')], snapshot('a'))).toMatchObject({ status: 'onTv' })
    const older = op('a', 'source.update', 'expired', '2026-10-16T10:00:00.000Z')
    const newer = op('a', 'source.update', 'pending', '2026-10-16T11:00:00.000Z')
    expect(listStatus('a', config('a', 1), [older, newer], snapshot('a'))).toMatchObject({ status: 'waiting' })
    expect(listStatus('a', config('a', 1), [newer, older].reverse(), snapshot('a'))).toMatchObject({ status: 'waiting' })
  })

  it('a carga do catálogo é da TV: aplicada = Na TV mesmo importando, sem esperar o snapshot, e erro de importação não vira Erro', () => {
    for (const importState of ['queued', 'running', 'completed', 'error']) {
      expect(listStatus('a', config('a', 1), [op('a', 'source.create', 'applied', undefined, importState)], snapshot('a'))).toMatchObject({ status: 'onTv' })
      expect(listStatus('a', config('a', 1), [op('a', 'source.create', 'applied', undefined, importState)], null)).toMatchObject({ status: 'onTv', canResend: false })
    }
  })

  it('junta as listas do snapshot e as só do portal, acha a revisão e separa exclusões órfãs', () => {
    const dashboard: Dashboard = { configurations: [config('a', 1), config('b')], operations: [op('x', 'source.delete', 'conflict'), op('y', 'source.delete', 'pending'), op('z', 'source.delete', 'applied')], snapshot: snapshot('a'), stale: false }
    const lists = collectLists(dashboard)
    expect(lists.map(list => list.id)).toEqual(['a', 'b'])
    expect(revisionOf(dashboard, 'a')).toBe(3)
    expect(revisionOf(dashboard, 'b')).toBe(0)
    expect(revisionOf({ ...dashboard, snapshot: null }, 'a')).toBe(1)
    // Só a exclusão que falhou pede ação; em andamento (y) ou já aplicada (z) não é lista nem log para esta tela.
    expect(orphanDeletions(dashboard, lists).map(operation => operation.sourceId)).toEqual(['x'])
  })
})
