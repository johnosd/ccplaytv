import { describe, expect, it } from 'vitest'
import { homeStatusLine } from './homeStatusLine'
import { createTranslator } from '../../lib/i18n/translate'

describe('cobertura parcial por armazenamento', () => {
  it('mostra a linha somente quando a pré-carga parou por storage_full', () => {
    const base = { sourceId: 's', updating: false, lastSuccessfulSyncAt: null, now: 0 }
    const progress = { sourceId: 's', state: 'paused' as const, ready: 2, total: 5, stoppedReason: 'storage_full' as const }
    expect(homeStatusLine({ ...base, progress })).toContain('Parte')
    expect(homeStatusLine({ ...base, progress: { ...progress, ready: 5 } })).toBeNull()
    expect(homeStatusLine({ ...base, progress: { ...progress, stoppedReason: undefined } }, createTranslator('en'))).not.toContain('STO-01')
  })
})
