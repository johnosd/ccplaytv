import { expect, it } from 'vitest'
import { CHECKLIST } from './checklist.mjs'
import { renderReport } from './report.mjs'

const candidate = { variant: 'base', revision: 'a'.repeat(40), version: '0.3.0', buildMode: 'production', wgtSha256: 'b'.repeat(64), dirty: false }

it('lista todos os IDs do checklist, os dinâmicos e o aviso de obsoleto', () => {
  const md = renderReport({
    candidate,
    results: [{ id: 'SAM-PKG-FILES', status: 'Pass', detail: 'ok' }, { id: 'SAM-PRV:http://tizen.org/privilege/internet', status: 'Pass', detail: 'ok' }],
    decision: 'Blocked',
    blockers: ['SAM-KIT-VOC'],
    approvedTargets: [],
    stale: { stale: true, reasons: ['wgtSha256'] },
  })
  for (const item of CHECKLIST) expect(md).toContain(`\`${item.id}\``)
  expect(md).toContain('SAM-PRV:http://tizen.org/privilege/internet')
  expect(md).toMatch(/obsoleto \(wgtSha256\)/)
  expect(md).toContain('b'.repeat(64))
})

it('não imprime artefatos nem conteúdo extra do resultado', () => {
  const md = renderReport({
    candidate,
    results: [{ id: 'SAM-KIT-LISTING', status: 'Blocked', detail: 'segredo encontrado', paths: ['listing/pt.md'], artifacts: [{ path: 'x', content: 's3cr3tValue' }], raw: 's3cr3tValue' }],
    decision: 'Blocked',
    blockers: ['SAM-KIT-LISTING'],
    approvedTargets: [],
  })
  expect(md).toContain('listing/pt.md')
  expect(md).not.toContain('s3cr3tValue')
})
