// Contrato da feature 091 (chave de legenda enviada pelo portal e aplicada na TV). Travado pelo sdd-plan.
import { expect, it, vi } from 'vitest'
import type { SaveSubtitleKeyResult } from '../subtitles/subtitleCredentials'
import type { SubtitleProvider } from '../subtitles/types'
import {
  applyRemoteSubtitleKeys,
  type RemoteSubtitleAck,
  type RemoteSubtitleInstruction,
  type RemoteSubtitlePorts,
} from './subtitleKeysRemote'

const KEY_OS = 'chave-opensubtitles-ficticia-091'
const KEY_SD = 'chave-subdl-ficticia-091-xyz'
const signal = new AbortController().signal
const accepted = (provider: SubtitleProvider): SaveSubtitleKeyResult => ({
  ok: true,
  status: { provider, state: 'valid', chosen: true, maskedKey: '••••xyz' },
})

function fake(instructions: RemoteSubtitleInstruction[], save: (provider: SubtitleProvider, key: string) => SaveSubtitleKeyResult | Error) {
  const acks: { provider: SubtitleProvider; operationId: string; ack: RemoteSubtitleAck }[] = []
  const saveKey = vi.fn(async (provider: SubtitleProvider, key: string) => {
    const result = save(provider, key)
    if (result instanceof Error) throw result
    return result
  })
  const removeKey = vi.fn(async (_provider: SubtitleProvider) => {})
  const ports: RemoteSubtitlePorts = {
    fetchInstructions: async () => instructions,
    ack: async (provider, operationId, ack) => { acks.push({ provider, operationId, ack }) },
    saveKey,
    removeKey,
  }
  return { ports, acks, saveKey, removeKey }
}

it('US1/AC5-AC6, US3, FR-006/FR-007/FR-008, Constitution Segredos: cada fornecedor é aplicado pelo caminho da TV, recusa não confirma como aplicada, e o ack leva só fornecedor, id e resultado — nunca a chave', async () => {
  // Nada pendente: não toca em chave nenhuma nem avisa ninguém.
  const idle = fake([], () => accepted('subdl'))
  expect(await applyRemoteSubtitleKeys(idle.ports, signal)).toEqual({ opensubtitles: 'none', subdl: 'none' })
  expect(idle.saveKey).not.toHaveBeenCalled(); expect(idle.removeKey).not.toHaveBeenCalled(); expect(idle.acks).toEqual([])

  // Dois fornecedores pendentes ao mesmo tempo: um aceito, outro recusado — resultados independentes.
  const both = fake(
    [{ provider: 'opensubtitles', operationId: 'op-1', action: 'set', key: KEY_OS }, { provider: 'subdl', operationId: 'op-2', action: 'set', key: KEY_SD }],
    (provider) => (provider === 'subdl' ? { ok: false, reason: 'refused' } : accepted(provider)),
  )
  expect(await applyRemoteSubtitleKeys(both.ports, signal)).toEqual({ opensubtitles: 'applied', subdl: 'rejected' })
  expect(both.saveKey.mock.calls).toEqual([['opensubtitles', KEY_OS], ['subdl', KEY_SD]])
  expect(both.acks).toEqual([
    { provider: 'opensubtitles', operationId: 'op-1', ack: { state: 'applied' } },
    { provider: 'subdl', operationId: 'op-2', ack: { state: 'rejected', reason: 'refused' } },
  ])
  const printed = JSON.stringify(both.acks)
  expect(printed).not.toContain(KEY_OS); expect(printed).not.toContain(KEY_SD)

  // Formato inválido é recusa; sem rede ou no limite do fornecedor não é recusa — fica pendente para a próxima tentativa.
  const malformed = fake([{ provider: 'subdl', operationId: 'op-3', action: 'set', key: 'x' }], () => ({ ok: false, reason: 'invalid_format' }))
  expect((await applyRemoteSubtitleKeys(malformed.ports, signal)).subdl).toBe('rejected')
  expect(malformed.acks[0].ack).toEqual({ state: 'rejected', reason: 'invalid_format' })
  for (const reason of ['offline', 'rate_limited'] as const) {
    const later = fake([{ provider: 'subdl', operationId: 'op-4', action: 'set', key: KEY_SD }], () => ({ ok: false, reason }))
    expect((await applyRemoteSubtitleKeys(later.ports, signal)).subdl).toBe('retry')
    expect(later.acks).toEqual([{ provider: 'subdl', operationId: 'op-4', ack: { state: 'retry', reason } }])
  }

  // Remover: a TV apaga a chave do fornecedor pedido (e só dele) e confirma.
  const remove = fake([{ provider: 'opensubtitles', operationId: 'op-5', action: 'remove' }], () => accepted('opensubtitles'))
  expect((await applyRemoteSubtitleKeys(remove.ports, signal)).opensubtitles).toBe('applied')
  expect(remove.removeKey.mock.calls).toEqual([['opensubtitles']])
  expect(remove.saveKey).not.toHaveBeenCalled()
  expect(remove.acks).toEqual([{ provider: 'opensubtitles', operationId: 'op-5', ack: { state: 'applied' } }])
})

it('FR-006/FR-007, Constitution Segredos: falha inesperada de um fornecedor não confirma como aplicada, não impede o outro e o erro não carrega a chave', async () => {
  const broken = fake(
    [{ provider: 'opensubtitles', operationId: 'op-1', action: 'set', key: KEY_OS }, { provider: 'subdl', operationId: 'op-2', action: 'set', key: KEY_SD }],
    (provider) => (provider === 'opensubtitles' ? new Error('falha com ' + KEY_OS) : accepted(provider)),
  )
  const failure = await applyRemoteSubtitleKeys(broken.ports, signal).then(() => undefined, (error: unknown) => error)
  expect(failure).toBeInstanceOf(Error)
  expect(String((failure as Error).message) + String((failure as Error).stack)).not.toContain(KEY_OS)
  // O outro fornecedor foi aplicado mesmo assim; o que quebrou não recebeu ack de "aplicada".
  expect(broken.acks).toEqual([{ provider: 'subdl', operationId: 'op-2', ack: { state: 'applied' } }])
  expect(JSON.stringify(broken.acks)).not.toContain(KEY_OS)
})
