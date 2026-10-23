import { describe, expect, it } from 'vitest'
import { createTranslator } from '../lib/i18n/translate'
import { DEFAULT_TRACK_CHOICE, type MediaTrack } from '../lib/player/tracks'
import { buildTracksPanel, formatExternalDelay, stepExternalDelay, type ExternalPanelInput } from './playerPanels'

const t = createTranslator('pt')
const TEXT_PT: MediaTrack = { id: 't0', kind: 'text', language: 'por', active: false }
const AUDIO: MediaTrack = { id: 'a0', kind: 'audio', language: 'por', active: true }

function input(overrides: Partial<ExternalPanelInput> = {}): ExternalPanelInput {
  return { stored: [], search: { mode: 'search', language: 'pt-BR' }, ...overrides }
}

describe('buildTracksPanel com legenda externa (feature 090)', () => {
  it('sem `external` a saída é a da 029, sem linha de busca', () => {
    const before = buildTracksPanel([AUDIO, TEXT_PT], DEFAULT_TRACK_CHOICE, t)
    expect(before.externalSearchRow).toBeNull()
    expect(before.rows.map((row) => row.key)).toEqual(['audio:a0', 'ad', 'text:off', 'text:t0', ...[-1000, -500, 0, 500, 1000].map((ms) => `delay:${ms}`)])
  })

  it('ordem: Legendas (embutidas, depois externas) → Buscar → Sincronização; "Desativadas" só sem nenhuma ativa', () => {
    const model = buildTracksPanel([AUDIO, TEXT_PT], DEFAULT_TRACK_CHOICE, t, input({
      stored: [{ language: 'pt-BR', active: false, delayMs: 0 }, { language: 'en', active: true, delayMs: -2500 }],
    }))
    expect(model.rows.map((row) => row.key)).toEqual(['audio:a0', 'ad', 'text:off', 'text:t0', 'external:pt-BR', 'external:en', 'external:search', 'delay:external'])
    expect(model.textRows.find((row) => row.key === 'text:off')?.checked).toBe(false)
    expect(model.textRows.find((row) => row.key === 'external:en')).toMatchObject({ checked: true, label: 'Externa — Inglês' })
    expect(model.externalSearchRow?.label).toBe('Buscar legenda online')
    // Com a externa ativa, as cinco opções da 029 viram um ajuste só, com o valor dela.
    expect(model.delayRows).toEqual([expect.objectContaining({ key: 'delay:external', delayMs: -2500, label: 'Sincronização: −2,5 s' })])
    expect(model.noTextNote).toBeNull()
  })

  it('externa guardada mas inativa: a sincronização é a da embutida; atalho do episódio seguinte e soft disabled sem licença', () => {
    const inactive = buildTracksPanel([], DEFAULT_TRACK_CHOICE, t, input({ stored: [{ language: 'pt-BR', active: false, delayMs: 0 }] }))
    expect(inactive.delayRows).toEqual([])
    expect(inactive.textRows.find((row) => row.key === 'text:off')?.checked).toBe(true)

    const shortcut = buildTracksPanel([], DEFAULT_TRACK_CHOICE, t, input({ search: { mode: 'shortcut', language: 'es' } }))
    expect(shortcut.externalSearchRow).toMatchObject({ label: 'Buscar legenda (Espanhol)', language: 'es', disabled: false })

    const locked = buildTracksPanel([], DEFAULT_TRACK_CHOICE, t, input({ search: { mode: 'search', language: 'pt-BR', disabledMessage: 'sem licença' } }))
    expect(locked.externalSearchRow).toMatchObject({ disabled: true, disabledMessage: 'sem licença' })
  })

  it('ajuste: 0,5 s por tecla, preso em ±10 s; rótulo no separador do idioma', () => {
    expect(stepExternalDelay(0, 'right')).toBe(500)
    expect(stepExternalDelay(0, 'left')).toBe(-500)
    expect(stepExternalDelay(10_000, 'right')).toBe(10_000)
    expect(stepExternalDelay(-10_000, 'left')).toBe(-10_000)
    expect(formatExternalDelay(0, t)).toBe('Sem atraso')
    expect(formatExternalDelay(1500, t)).toBe('+1,5 s')
    expect(formatExternalDelay(-500, createTranslator('en'))).toBe('−0.5 s')
    expect(formatExternalDelay(0, createTranslator('es'))).toBe('Sin retraso')
  })
})
