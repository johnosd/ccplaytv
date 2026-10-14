/** Feature 058 (T027, `logic/arquivo.md` §2): bordas da URL de arquivo. */
import { describe, expect, it } from 'vitest'
import { ArchiveClockUnknownError, buildArchiveUrl, type ArchiveUrlInput } from './archiveUrl'

const BASE: ArchiveUrlInput = {
  base: 'http://painel.invalid',
  username: 'u',
  password: 'p',
  streamId: '7',
  startMs: Date.UTC(2026, 9, 4, 12, 0),
  endMs: Date.UTC(2026, 9, 4, 13, 0),
  clock: { utcOffsetMinutes: 0 },
  extension: 'ts',
}

describe('buildArchiveUrl — bordas', () => {
  it('meia-noite no relógio do painel vira o dia certo', () => {
    const start = Date.UTC(2026, 9, 5, 2, 30) // 23:30 do dia 4 em São Paulo
    const url = buildArchiveUrl('rest', { ...BASE, startMs: start, endMs: start + 60 * 60_000, clock: { timezone: 'America/Sao_Paulo' } })
    expect(url).toContain('/60/2026-10-04:23-30/7.ts')
  })

  it('extensão m3u8 quando a conta só permite HLS', () => {
    expect(buildArchiveUrl('rest', { ...BASE, extension: 'm3u8' })).toMatch(/\/7\.m3u8$/)
  })

  it('segundos do início são descartados', () => {
    const url = buildArchiveUrl('rest', { ...BASE, startMs: BASE.startMs + 45_000 })
    expect(url).toContain('/2026-10-04:12-00/')
  })

  it('duração mínima de 1 minuto', () => {
    expect(buildArchiveUrl('rest', { ...BASE, endMs: BASE.startMs })).toContain('/1/2026-10-04:12-00/')
    expect(buildArchiveUrl('php', { ...BASE, endMs: BASE.startMs + 10_000 })).toMatch(/duration=1$/)
  })

  it('sem relógio: ArchiveClockUnknownError, cuja mensagem não carrega a credencial', () => {
    let error: unknown
    try {
      buildArchiveUrl('rest', { ...BASE, username: 'usuario-secreto', clock: {} })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ArchiveClockUnknownError)
    expect(String((error as Error).message)).not.toContain('usuario-secreto')
  })
})
