import { expect, it } from 'vitest'
import { TrustedClock } from './trustedClock'
it('rollback de parede não retrocede nem congela progresso monotônico da sessão', () => {
  let wall = 1000, mono = 10
  const clock = new TrustedClock({ timeHighWatermark: 500, signedServerTime: 700 }, () => wall, () => mono)
  expect(clock.now()).toBe(1000)
  wall = 1; mono = 110
  expect(clock.now()).toBe(1100)
  mono = 210
  expect(clock.now()).toBe(1200)
  clock.acceptServerTime(800)
  mono = 310
  expect(clock.now()).toBe(1300)
  wall = 10000
  expect(clock.now()).toBe(10000)
  wall = 1; mono = 410
  expect(clock.now()).toBe(10100)
})
it('checkpoint/restart e reset monotônico mantêm floor; standby só usa tempo observável', () => {
  let mono = 100
  const clock = new TrustedClock({ timeHighWatermark: 1000, signedServerTime: 700 }, () => 1, () => mono)
  mono = 200
  expect(clock.now()).toBe(1100)
  mono = 0
  expect(clock.now()).toBe(1100)
  mono = 50
  const checkpoint = clock.checkpoint()
  expect(checkpoint.timeHighWatermark).toBe(1150)
  const restarted = new TrustedClock(checkpoint, () => 1, () => mono)
  mono = 100
  expect(restarted.now()).toBe(1200)
  expect(() => clock.acceptServerTime(NaN)).toThrow('invalid_license_clock')
  // Sem parede confiável durante desligamento não há atestação do tempo perdido.
  expect(new TrustedClock(checkpoint, () => 1, () => 0).now()).toBe(1150)
})
