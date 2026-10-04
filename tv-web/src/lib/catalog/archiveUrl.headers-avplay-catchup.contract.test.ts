/**
 * Contrato da feature 058 (US2, `logic/arquivo.md` §2) — URL de arquivo do
 * painel Xtream: início no relógio do painel, duração em minutos, credencial
 * codificada; sem relógio conhecido, nenhuma URL (nunca adivinhar o fuso).
 */
import { describe, expect, it } from 'vitest'
import { buildArchiveUrl, type ArchiveUrlInput } from './archiveUrl'

const START = Date.UTC(2026, 9, 4, 12, 0) // 12:00 UTC = 09:00 em São Paulo (UTC−3)

const INPUT: ArchiveUrlInput = {
  base: 'http://painel.invalid:8080',
  username: 'joão',
  password: 'p@ss/1',
  streamId: '71775',
  startMs: START,
  endMs: START + 89 * 60_000 + 30_000, // 89,5 min → 90
  clock: { timezone: 'America/Sao_Paulo' },
  extension: 'ts',
}

describe('buildArchiveUrl (feature 058)', () => {
  // FR-017, FR-020; edge case "credencial da lista"; Constitution: IA e Classificação Nunca Inventam Dados (fuso).
  it('monta as duas variantes no relógio do painel (fuso nomeado com horário de verão, ou deslocamento medido) e recusa sem relógio', () => {
    expect(buildArchiveUrl('rest', INPUT)).toBe(
      'http://painel.invalid:8080/timeshift/jo%C3%A3o/p%40ss%2F1/90/2026-10-04:09-00/71775.ts',
    )
    expect(buildArchiveUrl('php', INPUT)).toBe(
      'http://painel.invalid:8080/streaming/timeshift.php?username=jo%C3%A3o&password=p%40ss%2F1&stream=71775&start=2026-10-04:09-00&duration=90',
    )

    // Lisboa: UTC+1 em julho — o fuso nomeado vence o deslocamento medido (0, de outra época do ano).
    const july = Date.UTC(2026, 6, 1, 20, 30)
    const lisbon = { ...INPUT, startMs: july, endMs: july + 60 * 60_000, clock: { timezone: 'Europe/Lisbon', utcOffsetMinutes: 0 } }
    expect(buildArchiveUrl('rest', lisbon)).toContain('/60/2026-07-01:21-30/71775.ts')

    // Sem fuso nomeado utilizável, vale o deslocamento medido.
    expect(buildArchiveUrl('rest', { ...INPUT, clock: { utcOffsetMinutes: -180 } })).toContain('/90/2026-10-04:09-00/')
    expect(buildArchiveUrl('rest', { ...INPUT, clock: { timezone: 'Nao/Existe', utcOffsetMinutes: -180 } })).toContain(
      '/90/2026-10-04:09-00/',
    )

    expect(() => buildArchiveUrl('rest', { ...INPUT, clock: {} })).toThrow()
  })
})
