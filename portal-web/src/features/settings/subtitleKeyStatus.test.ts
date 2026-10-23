import { expect, it } from 'vitest'
import { resolveSubtitleKeyView } from './subtitleKeyStatus'

it.each(['offline', 'rate_limited'] as const)('substituição pendente com %s vence o estado anterior e permite tentar depois', retryReason => {
  expect(resolveSubtitleKeyView({
    pending: { action: 'set', retryReason },
    last: { action: 'set', result: 'rejected', reason: 'refused' },
    tvReported: 'rate_limited',
  })).toEqual({ view: 'pending', canRemove: true, needsRetry: true, limited: false, unknown: false })
})

it('TV antiga só é desconhecida enquanto não houver uma operação a informar', () => {
  expect(resolveSubtitleKeyView({})).toMatchObject({ unknown: true, canRemove: false })
  expect(resolveSubtitleKeyView({ pending: { action: 'set' } })).toMatchObject({ view: 'pending', unknown: false })
  expect(resolveSubtitleKeyView({ last: { action: 'set', result: 'rejected', reason: 'invalid_format' } }))
    .toMatchObject({ view: 'rejected', reason: 'invalid_format', unknown: false, canRemove: false })
})

it('limite ou recusa no uso da chave pela TV vence o último envio aplicado', () => {
  const last = { action: 'set', result: 'applied' } as const
  expect(resolveSubtitleKeyView({ last, tvReported: 'rate_limited' }))
    .toMatchObject({ limited: true, canRemove: true, unknown: false })
  expect(resolveSubtitleKeyView({ last, tvReported: 'rejected' }))
    .toMatchObject({ view: 'rejected', reason: 'refused', canRemove: true, limited: false })
})

it('remoção pendente conserva a chave atual até o ack; depois não há mais chave para remover', () => {
  const last = { action: 'set', result: 'applied' } as const
  expect(resolveSubtitleKeyView({ pending: { action: 'remove' }, last, tvReported: 'configured' }))
    .toMatchObject({ view: 'pending', canRemove: true })
  expect(resolveSubtitleKeyView({ last: { action: 'remove', result: 'applied' }, tvReported: 'none' }))
    .toMatchObject({ view: 'none', canRemove: false, unknown: false })
})
