import { describe, expect, it, vi } from 'vitest'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type AspectMode,
  type PlayerAdapter,
  type QualityOption,
} from './PlayerService'

interface FakeOptions {
  /** `undefined` → o adaptador não tem os métodos de aspecto. */
  aspectModes?: AspectMode[]
  setAspect?: (mode: AspectMode) => boolean
  getAspectModesThrows?: boolean
  /** `undefined` → o adaptador não tem os métodos de qualidade. */
  qualities?: QualityOption[] | null
  selectQuality?: (id: string | null) => boolean
  getQualitiesThrows?: boolean
}

function open(options: FakeOptions = {}) {
  const factory = (): PlayerAdapter => {
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
    }
    if (options.aspectModes || options.getAspectModesThrows) {
      adapter.getAspectModes = () => {
        if (options.getAspectModesThrows) throw new Error('boom')
        return options.aspectModes ?? []
      }
      adapter.setAspectMode = options.setAspect ?? (() => true)
    }
    if (options.qualities !== undefined || options.getQualitiesThrows) {
      adapter.getQualities = () => {
        if (options.getQualitiesThrows) throw new Error('boom')
        return options.qualities ?? null
      }
      adapter.selectQuality = options.selectQuality ?? (() => true)
    }
    return adapter
  }
  return createPlayerSession('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION, 'movie', { createAdapter: factory })
}

const Q: QualityOption[] = [
  { id: '0', height: 480 },
  { id: '1', height: 1080 },
]

describe('PlayerServiceSession — aspecto (feature 041)', () => {
  it('sem os métodos: nenhum modo, setAspectMode é no-op falso', () => {
    const session = open()
    expect(session.aspectModes).toEqual([])
    expect(session.currentAspect).toBeNull()
    expect(session.setAspectMode('fill')).toBe(false)
  })

  it('aspectModes é a interseção com ASPECT_MODES, na ordem de ASPECT_MODES, sem inventar', () => {
    const session = open({ aspectModes: ['zoom', 'fit', 'fill', 'bogus' as AspectMode] })
    expect(session.aspectModes).toEqual(['fit', 'fill', 'zoom'])
  })

  it('motor que lança ao declarar os modos = nenhum modo', () => {
    expect(open({ getAspectModesThrows: true }).aspectModes).toEqual([])
  })

  it('modo fora da lista não chega ao motor; aceito grava currentAspect', () => {
    const setAspect = vi.fn(() => true)
    const session = open({ aspectModes: ['fit', 'fill'], setAspect })
    expect(session.setAspectMode('zoom')).toBe(false)
    expect(setAspect).not.toHaveBeenCalled()
    expect(session.setAspectMode('fill')).toBe(true)
    expect(session.currentAspect).toBe('fill')
  })

  it('motor que recusa ou lança: false e currentAspect continua o do motor', () => {
    let mode: 'refuse' | 'throw' = 'refuse'
    const session = open({
      aspectModes: ['fit', 'fill'],
      setAspect: (m) => {
        if (m === 'fit') return true
        if (mode === 'throw') throw new Error('boom')
        return false
      },
    })
    expect(session.setAspectMode('fit')).toBe(true)
    expect(session.setAspectMode('fill')).toBe(false)
    mode = 'throw'
    expect(session.setAspectMode('fill')).toBe(false)
    expect(session.currentAspect).toBe('fit')
  })

  it('sessão fechada: nada chega ao motor', () => {
    const setAspect = vi.fn(() => true)
    const session = open({ aspectModes: ['fit'], setAspect })
    session.close()
    expect(session.setAspectMode('fit')).toBe(false)
    expect(setAspect).not.toHaveBeenCalled()
  })
})

describe('PlayerServiceSession — qualidade (feature 041)', () => {
  it('supportsQuality exige getQualities E selectQuality', () => {
    expect(open().supportsQuality).toBe(false)
    expect(open({ qualities: Q }).supportsQuality).toBe(true)
  })

  it('getQualities devolve o cru do motor; null, lançar e fechada viram null', () => {
    expect(open({ qualities: Q }).getQualities()).toEqual(Q)
    expect(open({ qualities: null }).getQualities()).toBeNull()
    expect(open({ getQualitiesThrows: true }).getQualities()).toBeNull()
    const closed = open({ qualities: Q })
    closed.close()
    expect(closed.getQualities()).toBeNull()
  })

  it('selectedQualityId só muda quando o motor aceita; null = Auto', () => {
    let accept = true
    const session = open({ qualities: Q, selectQuality: () => accept })
    expect(session.selectedQualityId).toBeNull()
    expect(session.selectQuality('1')).toBe(true)
    expect(session.selectedQualityId).toBe('1')
    accept = false
    expect(session.selectQuality('0')).toBe(false)
    expect(session.selectedQualityId).toBe('1')
    accept = true
    expect(session.selectQuality(null)).toBe(true)
    expect(session.selectedQualityId).toBeNull()
  })

  it('motor que lança em selectQuality: false, sem mudar a seleção', () => {
    const session = open({
      qualities: Q,
      selectQuality: () => {
        throw new Error('boom')
      },
    })
    expect(session.selectQuality('1')).toBe(false)
    expect(session.selectedQualityId).toBeNull()
  })

  it('sessão fechada: selectQuality não chega ao motor', () => {
    const selectQuality = vi.fn(() => true)
    const session = open({ qualities: Q, selectQuality })
    session.close()
    expect(session.selectQuality('1')).toBe(false)
    expect(selectQuality).not.toHaveBeenCalled()
  })
})
