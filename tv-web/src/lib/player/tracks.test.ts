import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRACK_CHOICE,
  normalizeLanguage,
  pickTracksForChoice,
  trackLabel,
  trackLabels,
  type MediaTrack,
} from './tracks'

function audio(id: string, extra: Partial<MediaTrack> = {}): MediaTrack {
  return { id, kind: 'audio', active: false, ...extra }
}

function text(id: string, extra: Partial<MediaTrack> = {}): MediaTrack {
  return { id, kind: 'text', active: false, ...extra }
}

describe('normalizeLanguage (logic §2)', () => {
  it('junta 3 letras, 2 letras e regionais no mesmo código de 2 letras', () => {
    expect(normalizeLanguage('por')).toBe('pt')
    expect(normalizeLanguage('pt')).toBe('pt')
    expect(normalizeLanguage('pt-BR')).toBe('pt')
    expect(normalizeLanguage('PT_br')).toBe('pt')
    expect(normalizeLanguage('eng')).toBe('en')
    expect(normalizeLanguage('fre')).toBe('fr')
    expect(normalizeLanguage('fra')).toBe('fr')
  })

  it('ausente, vazio e códigos de "sem idioma" viram undefined', () => {
    for (const code of [undefined, '', '  ', 'und', 'UND', 'unk', 'mis', 'zxx', 'qaa']) {
      expect(normalizeLanguage(code), String(code)).toBeUndefined()
    }
  })

  it('código fora da tabela fica como veio (minúsculo) — não é inventado nem descartado', () => {
    expect(normalizeLanguage('KAZ')).toBe('kaz')
  })
})

describe('trackLabel (logic §2)', () => {
  it('legenda: só o nome do idioma, sem extras mesmo que existam', () => {
    expect(trackLabel(text('t', { language: 'por', codec: 'SRT', channels: 2 }), 1)).toBe('Português')
  })

  it('áudio: idioma • codec em maiúsculas • canais', () => {
    expect(trackLabel(audio('a', { language: 'eng', codec: 'aac', channels: 6 }), 1)).toBe('Inglês • AAC • 5.1')
    expect(trackLabel(audio('a', { language: 'por', channels: 2 }), 1)).toBe('Português • Estéreo')
    expect(trackLabel(audio('a', { language: 'por', channels: 1 }), 1)).toBe('Português • Mono')
    expect(trackLabel(audio('a', { language: 'por', channels: 8 }), 1)).toBe('Português • 7.1')
    expect(trackLabel(audio('a', { language: 'por', channels: 3 }), 1)).toBe('Português • 3 canais')
  })

  it('sem idioma usa "Faixa N" (nunca um idioma adivinhado); código desconhecido vai em maiúsculas', () => {
    expect(trackLabel(audio('a'), 2)).toBe('Faixa 2')
    expect(trackLabel(audio('a', { language: 'und', codec: 'ac3' }), 3)).toBe('Faixa 3 • AC3')
    expect(trackLabel(text('t', { language: 'kaz' }), 1)).toBe('KAZ')
  })
})

describe('trackLabels (logic §2, duplicados)', () => {
  it('dois rótulos idênticos do mesmo tipo ganham "• Faixa N"', () => {
    const labels = trackLabels([audio('a0', { language: 'por' }), audio('a1', { language: 'por' })])
    expect(labels).toEqual(['Português • Faixa 1', 'Português • Faixa 2'])
  })

  it('extras distintos já distinguem — sem sufixo', () => {
    const labels = trackLabels([
      audio('a0', { language: 'por', codec: 'AAC' }),
      audio('a1', { language: 'por', codec: 'AC3' }),
    ])
    expect(labels).toEqual(['Português • AAC', 'Português • AC3'])
  })

  it('áudio e legenda com o mesmo idioma não colidem entre si; o ordinal conta dentro do próprio tipo', () => {
    const labels = trackLabels([
      audio('a0', { language: 'por' }),
      text('t0', { language: 'por' }),
      audio('a1'),
      text('t1'),
    ])
    expect(labels).toEqual(['Português', 'Português', 'Faixa 2', 'Faixa 2'])
  })
})

describe('pickTracksForChoice (logic §4)', () => {
  const tracks: MediaTrack[] = [
    audio('a0', { language: 'por' }),
    audio('a1', { language: 'eng' }),
    audio('a2', { language: 'eng', audioDescription: true }),
    text('t0', { language: 'por' }),
    text('t1', { language: 'eng' }),
  ]

  it('sem preferência: não mexe no áudio e desativa a legenda', () => {
    expect(pickTracksForChoice(tracks, DEFAULT_TRACK_CHOICE)).toEqual({ audioId: undefined, textId: null })
  })

  it('casa por idioma normalizado, ignorando o código usado pelo motor e faixas de áudio-descrição', () => {
    const choice = { audioLanguage: 'en', textLanguage: 'pt', subtitleDelayMs: 500 }
    expect(pickTracksForChoice(tracks, choice)).toEqual({ audioId: 'a1', textId: 't0' })
    // Outra sessão, mesmos idiomas em códigos e ids diferentes.
    const other: MediaTrack[] = [audio('7', { language: 'en' }), text('9', { language: 'pt-BR' })]
    expect(pickTracksForChoice(other, choice)).toEqual({ audioId: '7', textId: '9' })
  })

  it('idioma ausente no item novo cai no padrão do stream (áudio intocado, legenda desativada)', () => {
    const choice = { audioLanguage: 'ja', textLanguage: 'ja', subtitleDelayMs: 0 }
    expect(pickTracksForChoice(tracks, choice)).toEqual({ audioId: undefined, textId: null })
  })

  it('só existir áudio-descrição no idioma escolhido não conta como faixa desse idioma', () => {
    const onlyDescription: MediaTrack[] = [audio('a0', { language: 'por' }), audio('a1', { language: 'eng', audioDescription: true })]
    const choice = { audioLanguage: 'en', textLanguage: null, subtitleDelayMs: 0 }
    expect(pickTracksForChoice(onlyDescription, choice).audioId).toBeUndefined()
  })
})
