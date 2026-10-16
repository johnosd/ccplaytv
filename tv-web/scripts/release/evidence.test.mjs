import { expect, it } from 'vitest'
import { checkEvidence } from './evidence.mjs'

const HASH = 'a'.repeat(64)
const statusOf = (results, id) => results.find((r) => r.id === id)?.status
const tv = { gate: 'INT-EVD-TV', candidate: { wgtSha256: HASH }, environment: 'tv', device: 'QN50Q60DAGXZD', firmware: 'fw', result: 'Pass', date: '2026-10-16', by: 'release' }

it('evidência de outro .wgt não conta; a do mesmo pacote passa', () => {
  expect(statusOf(checkEvidence({ evidence: [{ ...tv, candidate: { wgtSha256: 'b'.repeat(64) } }], wgtSha256: HASH }), 'INT-EVD-TV')).toBe('Pending')
  expect(statusOf(checkEvidence({ evidence: [tv], wgtSha256: HASH }), 'INT-EVD-TV')).toBe('Pass')
})

it('evidência de navegador não satisfaz INT-EVD-TV; sem evidência fica Pending, nunca Pass', () => {
  const results = checkEvidence({ evidence: [{ ...tv, environment: 'browser' }], wgtSha256: HASH })
  expect(statusOf(results, 'INT-EVD-TV')).toBe('Pending')
  for (const id of ['INT-EVD-STATIC', 'INT-EVD-BUILD', 'INT-EVD-E2E', 'INT-EVD-EMULATOR', 'INT-UPD-PRESERVE']) {
    expect(statusOf(results, id), id).toBe('Pending')
  }
})

it('falha bloqueia; Waived do emulador mantém dono e justificativa; a mais recente vence', () => {
  const emu = { gate: 'INT-EVD-EMULATOR', candidate: { wgtSha256: HASH }, environment: 'emulator', result: 'Waived', date: '2026-10-16', by: 'release', limitations: 'install 118, -4 (R-003)' }
  const waived = checkEvidence({ evidence: [emu], wgtSha256: HASH }).find((r) => r.id === 'INT-EVD-EMULATOR')
  expect(waived).toMatchObject({ status: 'Waived', owner: 'release', justification: 'install 118, -4 (R-003)' })
  const older = { ...tv, result: 'Blocked', date: '2026-10-15' }
  expect(statusOf(checkEvidence({ evidence: [older, tv], wgtSha256: HASH }), 'INT-EVD-TV')).toBe('Pass')
  expect(statusOf(checkEvidence({ evidence: [{ ...tv, result: 'Blocked' }], wgtSha256: HASH }), 'INT-EVD-TV')).toBe('Blocked')
})
