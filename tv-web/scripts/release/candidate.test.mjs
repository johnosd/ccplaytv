import { expect, it } from 'vitest'
import { compareWithPrevious, describeCandidate } from './candidate.mjs'

const input = { variant: 'base', revision: 'a'.repeat(40), dirtyPaths: [], buildMode: 'production', version: '0.3.0', wgtSha256: 'b'.repeat(64) }
const statusOf = (results, id) => results.find((r) => r.id === id)?.status

it('sem relatório anterior não é obsoleto; variante e modo de build diferentes são, com as razões', () => {
  const { candidate } = describeCandidate(input)
  expect(compareWithPrevious(undefined, candidate)).toEqual({ stale: false, reasons: [] })
  const other = describeCandidate({ ...input, variant: 'commercial', buildMode: 'commercial' }).candidate
  expect(compareWithPrevious(candidate, other)).toEqual({ stale: true, reasons: ['variant', 'buildMode'] })
  expect(compareWithPrevious(candidate, { ...candidate, version: '0.4.0' }).reasons).toEqual(['version'])
})

it('hash, revisão ou versão inválidos bloqueiam INT-CAND-HASH sem ecoar o valor', () => {
  for (const bad of [{ wgtSha256: 'xyz' }, { wgtSha256: '' }, { revision: 'abc' }, { version: '' }]) {
    const { results } = describeCandidate({ ...input, ...bad })
    expect(statusOf(results, 'INT-CAND-HASH')).toBe('Blocked')
  }
  const { results } = describeCandidate({ ...input, wgtSha256: 'S3CR3T-nao-e-hash' })
  expect(JSON.stringify(results)).not.toContain('S3CR3T')
})
