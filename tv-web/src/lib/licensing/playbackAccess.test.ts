import { expect, it } from 'vitest'
import { evaluatePlaybackAccess, type PlaybackAccessInput } from './playbackAccess'
const valid: PlaybackAccessInput = { deviceId: 'fixture', entitlement: { deviceId: 'fixture', startsAt: 100, expiresAt: 1000, state: 'trial' }, verification: 'valid', trustedNow: 100, serviceOnline: false }
it('trial começa no instante inclusivo e vence no limite, independentemente de rede', () => {
  expect(evaluatePlaybackAccess(valid)).toEqual({ allowed: true, reason: 'valid' })
  expect(evaluatePlaybackAccess({ ...valid, trustedNow: 99 })).toEqual({ allowed: false, reason: 'not_activated' })
  expect(evaluatePlaybackAccess({ ...valid, trustedNow: 1000, serviceOnline: true })).toEqual({ allowed: false, reason: 'expired' })
  expect(evaluatePlaybackAccess({ ...valid, entitlement: undefined, verification: 'missing' })).toEqual({ allowed: false, reason: 'not_activated' })
})
it('tempos malformados, destino e assinatura inválidos falham fechados sem mutar entrada', () => {
  for (const trustedNow of [NaN, Infinity, -1]) expect(evaluatePlaybackAccess({ ...valid, trustedNow }).allowed).toBe(false)
  for (const expiresAt of [NaN, Infinity, 0, 100]) expect(evaluatePlaybackAccess({ ...valid, entitlement: { ...valid.entitlement!, expiresAt } }).reason).toBe('invalid')
  expect(evaluatePlaybackAccess({ ...valid, verification: 'invalid' }).reason).toBe('invalid')
  expect(evaluatePlaybackAccess({ ...valid, deviceId: 'other' }).reason).toBe('invalid')
  expect(valid.entitlement?.expiresAt).toBe(1000)
})
