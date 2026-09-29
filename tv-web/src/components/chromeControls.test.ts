import { describe, expect, it } from 'vitest'
import { chromeControls, hasSeekBar } from './chromeControls'
import type { PlayerCapabilities, PlayerProgress } from '../lib/player/PlayerService'

const FULL: PlayerCapabilities = { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true }
const NONE: PlayerCapabilities = { canPause: false, canSeek: false, reportsPosition: false, reportsDuration: false }

describe('chromeControls (feature 027, logic/chrome-player.md §2)', () => {
  it('Live: ordem fixa guide/tracks/quality/aspect/info, nunca playPause/speed', () => {
    const controls = chromeControls('live', FULL, false, null)
    expect(controls.map((c) => c.id)).toEqual(['guide', 'tracks', 'quality', 'aspect', 'info'])
    expect(controls.find((c) => c.id === 'speed')).toBeUndefined()
    expect(controls.find((c) => c.id === 'playPause')).toBeUndefined()
  })

  it('Guia/Qualidade/Aspecto continuam "soon"; Áudio e Info seguem o motor (feature 029)', () => {
    const none = chromeControls('live', FULL, false, null)
    expect(none.filter((c) => c.availability === 'soon').map((c) => c.id)).toEqual(['guide', 'quality', 'aspect'])
    expect(none.find((c) => c.id === 'tracks')).toMatchObject({ availability: 'unavailable', label: 'Áudio e legendas — indisponível' })
    expect(none.find((c) => c.id === 'info')).toMatchObject({ availability: 'unavailable', label: 'Info do stream — indisponível' })

    const both = chromeControls('live', FULL, false, null, { tracks: true, info: true })
    expect(both.find((c) => c.id === 'tracks')).toMatchObject({ availability: 'real', label: 'Áudio e legendas' })
    expect(both.find((c) => c.id === 'info')).toMatchObject({ availability: 'real', label: 'Info do stream' })

    const onlyInfo = chromeControls('vod', FULL, false, null, { tracks: false, info: true })
    expect(onlyInfo.find((c) => c.id === 'tracks')?.availability).toBe('unavailable')
    expect(onlyInfo.find((c) => c.id === 'info')?.availability).toBe('real')
  })

  it('features não muda a ordem nem a posição dos controles (a linha da 027 continua a mesma)', () => {
    const without = chromeControls('vod', FULL, false, { hasPrevious: true, hasNext: true })
    const withAll = chromeControls('vod', FULL, false, { hasPrevious: true, hasNext: true }, { tracks: true, info: true })
    expect(withAll.map((c) => c.id)).toEqual(without.map((c) => c.id))
  })

  it('Live ignora capabilities e episódio (não fazem sentido no canal)', () => {
    const withCaps = chromeControls('live', FULL, false, { hasPrevious: true, hasNext: true })
    const withoutCaps = chromeControls('live', NONE, true, null)
    expect(withCaps.map((c) => c.id)).toEqual(withoutCaps.map((c) => c.id))
  })

  it('VOD com todas as capacidades e sem episódio: jumpBack/playPause/jumpForward + 5 mocks, "Velocidade" presente', () => {
    const controls = chromeControls('vod', FULL, false, null)
    expect(controls.map((c) => c.id)).toEqual([
      'jumpBack',
      'playPause',
      'jumpForward',
      'tracks',
      'quality',
      'speed',
      'aspect',
      'info',
    ])
    expect(controls.find((c) => c.id === 'speed')).toBeDefined()
    expect(controls.find((c) => c.id === 'guide')).toBeUndefined()
  })

  it('VOD sem canPause/canSeek: nem jumpBack/jumpForward nem playPause entram (D-003 da 011)', () => {
    const controls = chromeControls('vod', NONE, false, null)
    expect(controls.map((c) => c.id)).toEqual(['tracks', 'quality', 'speed', 'aspect', 'info'])
  })

  it('VOD com episódio no meio: episodePrevious/episodeNext "real", ordem episodePrevious…episodeNext antes dos mocks', () => {
    const controls = chromeControls('vod', FULL, false, { hasPrevious: true, hasNext: true })
    expect(controls.map((c) => c.id)).toEqual([
      'episodePrevious',
      'jumpBack',
      'playPause',
      'jumpForward',
      'episodeNext',
      'tracks',
      'quality',
      'speed',
      'aspect',
      'info',
    ])
    expect(controls.find((c) => c.id === 'episodePrevious')?.availability).toBe('real')
    expect(controls.find((c) => c.id === 'episodeNext')?.availability).toBe('real')
  })

  it('VOD no primeiro episódio: episodePrevious "limit" com rótulo de indisponível', () => {
    const controls = chromeControls('vod', FULL, false, { hasPrevious: false, hasNext: true })
    const previous = controls.find((c) => c.id === 'episodePrevious')
    expect(previous?.availability).toBe('limit')
    expect(previous?.label).toBe('Episódio anterior — indisponível')
  })

  it('VOD no último episódio: episodeNext "limit" com rótulo de indisponível', () => {
    const controls = chromeControls('vod', FULL, false, { hasPrevious: true, hasNext: false })
    const next = controls.find((c) => c.id === 'episodeNext')
    expect(next?.availability).toBe('limit')
    expect(next?.label).toBe('Próximo episódio — indisponível')
  })

  it('playPause: rótulo "Pausar" tocando, "Reproduzir" pausado — a posição na linha não muda', () => {
    const playing = chromeControls('vod', FULL, false, null)
    const paused = chromeControls('vod', FULL, true, null)
    expect(playing.find((c) => c.id === 'playPause')?.label).toBe('Pausar')
    expect(paused.find((c) => c.id === 'playPause')?.label).toBe('Reproduzir')
    expect(playing.findIndex((c) => c.id === 'playPause')).toBe(paused.findIndex((c) => c.id === 'playPause'))
  })

  it('cada mock aponta pro seu id em COMING_SOON, e Guia reusa "epg-guide" (feature 024); Áudio/Info não são mais mock (029)', () => {
    const vod = chromeControls('vod', FULL, false, null)
    expect(vod.find((c) => c.id === 'tracks')?.comingSoonId).toBeUndefined()
    expect(vod.find((c) => c.id === 'info')?.comingSoonId).toBeUndefined()
    expect(vod.find((c) => c.id === 'quality')?.comingSoonId).toBe('player-quality')
    expect(vod.find((c) => c.id === 'speed')?.comingSoonId).toBe('player-speed')
    expect(vod.find((c) => c.id === 'aspect')?.comingSoonId).toBe('player-aspect')
    const live = chromeControls('live', FULL, false, null)
    expect(live.find((c) => c.id === 'guide')?.comingSoonId).toBe('epg-guide')
  })
})

describe('hasSeekBar', () => {
  const progress: PlayerProgress = { positionMs: 1000, durationMs: 60_000 }

  it('true só com reportsDuration e durationMs conhecido', () => {
    expect(hasSeekBar(FULL, progress)).toBe(true)
    expect(hasSeekBar(NONE, progress)).toBe(false)
    expect(hasSeekBar(FULL, null)).toBe(false)
    expect(hasSeekBar(FULL, { positionMs: 1000, durationMs: undefined })).toBe(false)
  })
})
