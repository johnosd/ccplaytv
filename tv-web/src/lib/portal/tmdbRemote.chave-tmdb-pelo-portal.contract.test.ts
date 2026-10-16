// Contrato da feature 077 (chave TMDB enviada pelo portal e aplicada na TV). Travado pelo sdd-plan.
import { expect, it, vi } from 'vitest'
import type { SaveTmdbKeyResult, TmdbStatusView } from '../metadata/types'
import { applyRemoteTmdb, type RemoteTmdbAck, type RemoteTmdbInstruction, type RemoteTmdbPorts } from './tmdbRemote'

const KEY = '0123456789abcdef0123456789abcdef'
const signal = new AbortController().signal
const ok = { ok: true, status: { state: 'connected' } as unknown as TmdbStatusView } as SaveTmdbKeyResult

function ports(instruction: RemoteTmdbInstruction | null, save: SaveTmdbKeyResult | Error = ok) {
  const acks: { operationId: string; ack: RemoteTmdbAck }[] = []
  const saveKey = vi.fn(async (_key: string) => { if (save instanceof Error) throw save; return save })
  const removeKey = vi.fn(async () => {})
  const value: RemoteTmdbPorts = {
    fetchInstruction: async () => instruction,
    ack: async (operationId, ack) => { acks.push({ operationId, ack }) },
    saveKey, removeKey,
  }
  return { value, acks, saveKey, removeKey }
}

it('US4-AC2/AC3/AC4/Constitution Segredos: aplica, recusa, adia e remove; só o id e o resultado vão no ack, nunca a chave', async () => {
  // Nada pendente: não toca na chave nem avisa ninguém.
  const idle = ports(null)
  expect(await applyRemoteTmdb(idle.value, signal)).toBe('none')
  expect(idle.saveKey).not.toHaveBeenCalled(); expect(idle.removeKey).not.toHaveBeenCalled(); expect(idle.acks).toEqual([])

  // Definir: a TV testa e guarda pelo caminho normal e confirma.
  const set = ports({ operationId: 'op-1', action: 'set', key: KEY })
  expect(await applyRemoteTmdb(set.value, signal)).toBe('applied')
  expect(set.saveKey).toHaveBeenCalledWith(KEY)
  expect(set.acks).toEqual([{ operationId: 'op-1', ack: { state: 'applied' } }])

  // O TMDB recusou ou o formato é inválido: resultado "rejected" com o motivo, sem a chave.
  const refused = ports({ operationId: 'op-2', action: 'set', key: KEY }, { ok: false, reason: 'refused' })
  expect(await applyRemoteTmdb(refused.value, signal)).toBe('rejected')
  expect(refused.acks).toEqual([{ operationId: 'op-2', ack: { state: 'rejected', reason: 'refused' } }])
  const malformed = ports({ operationId: 'op-3', action: 'set', key: 'x' }, { ok: false, reason: 'invalid_format' })
  expect(await applyRemoteTmdb(malformed.value, signal)).toBe('rejected')
  expect(malformed.acks[0].ack).toEqual({ state: 'rejected', reason: 'invalid_format' })

  // Sem internet / limite do TMDB: não é recusa — fica pendente para a próxima tentativa.
  for (const reason of ['offline', 'rate_limited'] as const) {
    const later = ports({ operationId: 'op-4', action: 'set', key: KEY }, { ok: false, reason })
    expect(await applyRemoteTmdb(later.value, signal)).toBe('retry')
    expect(later.acks).toEqual([{ operationId: 'op-4', ack: { state: 'retry', reason } }])
  }

  // Remover: sem chave no pedido, a TV remove e confirma.
  const remove = ports({ operationId: 'op-5', action: 'remove' })
  expect(await applyRemoteTmdb(remove.value, signal)).toBe('applied')
  expect(remove.removeKey).toHaveBeenCalledOnce(); expect(remove.saveKey).not.toHaveBeenCalled()
  expect(remove.acks).toEqual([{ operationId: 'op-5', ack: { state: 'applied' } }])

  // Falha inesperada da TV: o erro não carrega a chave e nada é confirmado como aplicado.
  const broken = ports({ operationId: 'op-6', action: 'set', key: KEY }, new Error('falha com ' + KEY))
  const failure = await applyRemoteTmdb(broken.value, signal).then(() => undefined, (error: unknown) => error)
  expect(String((failure as Error | undefined)?.message ?? '')).not.toContain(KEY)
  expect(broken.acks.every(item => item.ack.state !== 'applied')).toBe(true)
  for (const item of [set, refused, malformed, remove, broken]) expect(JSON.stringify(item.acks)).not.toContain(KEY)
})
