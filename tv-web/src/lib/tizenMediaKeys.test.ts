import { afterEach, describe, expect, it } from 'vitest'
import { MEDIA_KEY_CODES, mediaKeyOf, registerMediaKeys } from './tizenMediaKeys'

type FakeTizen = { tvinputdevice?: { getSupportedKeys?: () => Array<{ name: string; code: number }>; registerKey?: (name: string) => void } }

function setTizen(value: FakeTizen | undefined) {
  ;(window as unknown as { tizen?: FakeTizen }).tizen = value
}

afterEach(() => {
  setTizen(undefined)
})

describe('registerMediaKeys (feature 027, FR-023, D-006)', () => {
  it('fora da TV (window.tizen ausente) é no-op silencioso, devolve []', () => {
    setTizen(undefined)
    expect(registerMediaKeys()).toEqual([])
  })

  it('sem tvinputdevice.registerKey é no-op, devolve []', () => {
    setTizen({ tvinputdevice: {} })
    expect(registerMediaKeys()).toEqual([])
  })

  it('lista ausente (getSupportedKeys ausente) não registra nada', () => {
    const registered: string[] = []
    setTizen({ tvinputdevice: { registerKey: (name) => registered.push(name) } })
    expect(registerMediaKeys()).toEqual([])
    expect(registered).toEqual([])
  })

  it('lista vazia não registra nada — diferente de tizenColorKey.ts (D-006, mais estrito)', () => {
    const registered: string[] = []
    setTizen({
      tvinputdevice: { getSupportedKeys: () => [], registerKey: (name) => registered.push(name) },
    })
    expect(registerMediaKeys()).toEqual([])
    expect(registered).toEqual([])
  })

  it('getSupportedKeys lançando não registra nada', () => {
    setTizen({
      tvinputdevice: {
        getSupportedKeys: () => {
          throw new Error('falha de plataforma')
        },
        registerKey: () => {
          throw new Error('não deveria chamar')
        },
      },
    })
    expect(registerMediaKeys()).toEqual([])
  })

  it('registra só as teclas listadas por getSupportedKeys, na ordem de MEDIA_KEYS', () => {
    const registered: string[] = []
    setTizen({
      tvinputdevice: {
        getSupportedKeys: () => [
          { name: 'MediaPlayPause', code: 10252 },
          { name: 'MediaStop', code: 413 },
          { name: 'VolumeUp', code: 447 }, // não faz parte de MEDIA_KEYS — ignorada
        ],
        registerKey: (name) => registered.push(name),
      },
    })
    const result = registerMediaKeys()
    expect(result).toEqual(['MediaPlayPause', 'MediaStop'])
    expect(registered).toEqual(['MediaPlayPause', 'MediaStop'])
  })

  it('uma tecla que falha ao registrar não impede as demais', () => {
    setTizen({
      tvinputdevice: {
        getSupportedKeys: () => [
          { name: 'MediaPlayPause', code: 10252 },
          { name: 'MediaStop', code: 413 },
        ],
        registerKey: (name) => {
          if (name === 'MediaPlayPause') throw new Error('privilégio ausente pra esta tecla')
        },
      },
    })
    expect(registerMediaKeys()).toEqual(['MediaStop'])
  })
})

describe('mediaKeyOf (feature 027, §5)', () => {
  it('reconhece por event.key', () => {
    expect(mediaKeyOf(new KeyboardEvent('keydown', { key: 'MediaPlayPause' }))).toBe('MediaPlayPause')
    expect(mediaKeyOf(new KeyboardEvent('keydown', { key: 'ChannelUp' }))).toBe('ChannelUp')
  })

  it('reconhece por keyCode quando event.key não é o nome esperado', () => {
    expect(mediaKeyOf(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: MEDIA_KEY_CODES.MediaStop }))).toBe(
      'MediaStop',
    )
  })

  it('tecla sem correspondência nem por nome nem por keyCode devolve null', () => {
    expect(mediaKeyOf(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37 }))).toBeNull()
  })
})
