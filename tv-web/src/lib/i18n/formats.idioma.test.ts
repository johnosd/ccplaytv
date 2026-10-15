import { describe, expect, it } from 'vitest'
import { formatAccountDate } from '../catalog/sourceAccount'
import { formatEpgClock, formatEpgTimeRange } from '../epg/formatEpgTime'
import { mapTmdbDetail } from '../metadata/tmdbMapping'
import { createTranslator } from './translate'

/** Feature 054, Fase 12 (US4): formatos de exibição acompanham o idioma do app; sem `language`, português como antes. */

describe('formatos por idioma do app (feature 054)', () => {
  const at = (hour: number, minute: number) => new Date(2026, 9, 3, hour, minute).getTime()

  it('hora do guia: sempre 24 h, em qualquer idioma (colunas de largura fixa)', () => {
    for (const language of ['pt', 'en', 'es'] as const) {
      expect(formatEpgClock(at(20, 5), language)).toBe('20:05')
      expect(formatEpgClock(at(0, 30), language)).toBe('00:30') // nunca "24:30"
    }
    expect(formatEpgClock(at(8, 0))).toBe('08:00') // padrão = português
    expect(formatEpgTimeRange(at(20, 0), at(21, 30), 'en')).toBe('20:00 – 21:30')
  })

  it('data da assinatura segue a ordem do idioma (en: mês/dia; pt/es: dia/mês)', () => {
    const date = new Date(2026, 9, 3).getTime()
    expect(formatAccountDate(date)).toBe('03/10/2026')
    expect(formatAccountDate(date, 'es')).toBe('03/10/2026')
    expect(formatAccountDate(date, 'en')).toBe('10/03/2026')
  })

  it('nome do país vem no idioma do app; sem idioma, português', () => {
    const detail = { production_countries: [{ iso_3166_1: 'BR' }, { iso_3166_1: 'US' }] }
    expect(mapTmdbDetail('movie', detail).country).toBe('Brasil, Estados Unidos')
    expect(mapTmdbDetail('movie', detail, 'en').country).toBe('Brazil, United States')
    expect(mapTmdbDetail('movie', detail, 'es').country).toBe('Brasil, Estados Unidos')
    expect(mapTmdbDetail('tv', { origin_country: ['JP'] }, 'en').country).toBe('Japan')
  })

  it('números nas mensagens usam o separador de milhar do idioma', () => {
    expect(createTranslator('pt').plural('src.count.channels', 1200)).toBe('1.200 canais')
    expect(createTranslator('en').plural('src.count.channels', 1200)).toBe('1,200 channels')
    expect(createTranslator('es').plural('src.count.channels', 1200)).toBe('1200 canales') // es-ES não agrupa números de 4 dígitos
  })
})
