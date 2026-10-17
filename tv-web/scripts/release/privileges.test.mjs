import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseTizenConfig } from './packageChecks.mjs'
import { checkPrivileges } from './privileges.mjs'

const config = parseTizenConfig(readFileSync(new URL('../../../CCPlayTv/config.xml', import.meta.url), 'utf8'))
const ledger = JSON.parse(readFileSync(new URL('../../../release/samsung/privileges.json', import.meta.url), 'utf8'))
const statusOf = (results, id) => results.find((r) => r.id === id)?.status

it('o ledger real cobre todos os privilégios do config.xml real nas duas variantes, sem bloqueio', () => {
  for (const variant of ['base', 'commercial']) {
    const results = checkPrivileges({ declared: config.privileges, ledger: ledger.privileges, features: ledger.features, variant })
    expect(results.filter((r) => r.status === 'Blocked'), variant).toEqual([])
    expect(statusOf(results, 'SAM-PRV')).toBe('Pass')
    expect(results).toHaveLength(config.privileges.length + 1)
  }
})

it('adinfo sem anúncio e smartcontroller.microphone sem autorização bloqueiam; com autorização e com anúncio passam', () => {
  const ad = 'http://developer.samsung.com/privilege/adinfo'
  const mic = 'http://developer.samsung.com/privilege/smartcontroller.microphone'
  const entry = { level: 'public', usedBy: { base: ['x'] } }
  const base = { ledger: { [ad]: entry, [mic]: entry }, variant: 'base' }
  const noAds = checkPrivileges({ ...base, declared: [ad, mic], features: { checkout: false, inAppAds: false } })
  expect(statusOf(noAds, `SAM-PRV:${ad}`)).toBe('Blocked')
  expect(statusOf(noAds, `SAM-PRV:${mic}`)).toBe('Blocked')
  const ok = checkPrivileges({
    declared: [ad, mic],
    ledger: { [ad]: entry, [mic]: { ...entry, authorization: { source: 'ticket do Samsung Content Manager', date: '2026-10-16' } } },
    features: { checkout: false, inAppAds: true },
    variant: 'base',
  })
  expect(statusOf(ok, 'SAM-PRV')).toBe('Pass')
})
