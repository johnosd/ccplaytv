import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAYER_PREFERENCES,
  PLAYER_PREFERENCES_STORAGE_KEY,
  readPlayerPreferences,
  trackChoiceFromPreferences,
  viewChoiceFromPreferences,
  writePlayerPreferences,
} from './playerPreferences'
import { DEFAULT_TRACK_CHOICE } from './tracks'
import { DEFAULT_VIEW_CHOICE } from './viewChoice'

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(PLAYER_PREFERENCES_STORAGE_KEY, initial)
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('readPlayerPreferences', () => {
  it('sem nada gravado: valores de fábrica', () => {
    expect(readPlayerPreferences(memory())).toEqual(DEFAULT_PLAYER_PREFERENCES)
  })

  it('lê o que foi gravado', () => {
    const stored = { aspect: 'fill', quality: 'max', audioLanguage: 'en', textLanguage: 'pt' }
    expect(readPlayerPreferences(memory(JSON.stringify(stored)))).toEqual(stored)
  })

  it('um campo inválido cai no padrão só dele, sem derrubar os outros', () => {
    const read = readPlayerPreferences(
      memory(JSON.stringify({ aspect: 'esticado', quality: 'min', audioLanguage: 'por', textLanguage: 42 })),
    )
    expect(read).toEqual({ aspect: 'fit', quality: 'min', audioLanguage: null, textLanguage: null })
  })

  it('JSON ilegível ou de tipo errado: fábrica', () => {
    expect(readPlayerPreferences(memory('{nao e json'))).toEqual(DEFAULT_PLAYER_PREFERENCES)
    expect(readPlayerPreferences(memory('"texto"'))).toEqual(DEFAULT_PLAYER_PREFERENCES)
    expect(readPlayerPreferences(memory('null'))).toEqual(DEFAULT_PLAYER_PREFERENCES)
  })

  it('armazenamento null ou que lança na leitura: fábrica, sem lançar', () => {
    expect(readPlayerPreferences(null)).toEqual(DEFAULT_PLAYER_PREFERENCES)
    const throwing = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {},
    }
    expect(readPlayerPreferences(throwing)).toEqual(DEFAULT_PLAYER_PREFERENCES)
  })

  it('devolve cópia: mudar o resultado não suja o padrão de fábrica', () => {
    readPlayerPreferences(memory()).aspect = 'zoom'
    expect(DEFAULT_PLAYER_PREFERENCES.aspect).toBe('fit')
  })
})

describe('writePlayerPreferences', () => {
  it('faz merge com o que já está gravado e devolve o resultado', () => {
    const storage = memory(JSON.stringify({ aspect: 'fill', quality: 'max', audioLanguage: 'en', textLanguage: null }))
    const result = writePlayerPreferences({ textLanguage: 'pt' }, storage)
    expect(result).toEqual({ aspect: 'fill', quality: 'max', audioLanguage: 'en', textLanguage: 'pt' })
    expect(readPlayerPreferences(storage)).toEqual(result)
  })

  it('armazenamento cheio (setItem lança): devolve o merge sem lançar, nada persiste', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('cheio')
      },
    }
    expect(writePlayerPreferences({ aspect: 'zoom' }, full)).toEqual({ ...DEFAULT_PLAYER_PREFERENCES, aspect: 'zoom' })
  })

  it('sem armazenamento: devolve o merge sem lançar', () => {
    expect(writePlayerPreferences({ quality: 'min' }, null)).toEqual({ ...DEFAULT_PLAYER_PREFERENCES, quality: 'min' })
  })
})

describe('sementes da sequência', () => {
  it('com as preferências de fábrica, as sementes são exatamente os padrões de hoje (029)', () => {
    expect(trackChoiceFromPreferences(DEFAULT_PLAYER_PREFERENCES)).toEqual(DEFAULT_TRACK_CHOICE)
    expect(viewChoiceFromPreferences(DEFAULT_PLAYER_PREFERENCES)).toEqual(DEFAULT_VIEW_CHOICE)
  })

  it('preferências viram escolha: idiomas nas faixas (atraso 0), aspecto/qualidade na vista', () => {
    const prefs = { aspect: 'zoom', quality: 'max', audioLanguage: 'en', textLanguage: 'pt' } as const
    expect(trackChoiceFromPreferences(prefs)).toEqual({ audioLanguage: 'en', textLanguage: 'pt', subtitleDelayMs: 0 })
    expect(viewChoiceFromPreferences(prefs)).toEqual({ aspect: 'zoom', quality: 'max' })
  })
})
