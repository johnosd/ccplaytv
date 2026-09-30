import { describe, expect, it } from 'vitest'
import { TRAILER_BRIDGE_ORIGIN, parseBridgeMessage, trailerBridgeSrc } from './bridgeConfig'

const frame = {} as Window
const other = {} as Window

function message(data: unknown, init: { origin?: string; source?: Window | null } = {}): MessageEvent {
  return {
    data,
    origin: init.origin ?? TRAILER_BRIDGE_ORIGIN,
    source: init.source === undefined ? frame : init.source,
  } as unknown as MessageEvent
}

const ok = { source: 'ccplay-trailer', v: 1, type: 'playing' }

describe('trailerBridgeSrc', () => {
  it('só o id vai na URL (FR-010)', () => {
    const url = new URL(trailerBridgeSrc('M7lc1UVf-VE'))
    expect(url.origin).toBe(TRAILER_BRIDGE_ORIGIN)
    expect([...url.searchParams.keys()]).toEqual(['v'])
    expect(url.searchParams.get('v')).toBe('M7lc1UVf-VE')
  })
})

describe('parseBridgeMessage', () => {
  it('aceita a forma exata, com a origem e a janela certas', () => {
    expect(parseBridgeMessage(message(ok), frame)).toEqual(ok)
    expect(parseBridgeMessage(message({ source: 'ccplay-trailer', v: 1, type: 'error', code: 150 }), frame)).toEqual({
      source: 'ccplay-trailer',
      v: 1,
      type: 'error',
      code: 150,
    })
  })

  it('recusa origem errada', () => {
    expect(parseBridgeMessage(message(ok, { origin: 'https://evil.example' }), frame)).toBeNull()
    expect(parseBridgeMessage(message(ok, { origin: 'null' }), frame)).toBeNull()
  })

  it('recusa janela errada (iframe remontado) e frame ausente', () => {
    expect(parseBridgeMessage(message(ok, { source: other }), frame)).toBeNull()
    expect(parseBridgeMessage(message(ok, { source: null }), frame)).toBeNull()
    expect(parseBridgeMessage(message(ok), null)).toBeNull()
  })

  it('recusa versão, fonte ou tipo desconhecidos', () => {
    expect(parseBridgeMessage(message({ ...ok, v: 2 }), frame)).toBeNull()
    expect(parseBridgeMessage(message({ ...ok, source: 'outro' }), frame)).toBeNull()
    expect(parseBridgeMessage(message({ ...ok, type: 'explodir' }), frame)).toBeNull()
  })

  it('recusa dado que não é objeto', () => {
    for (const data of [null, undefined, 'ready', 42, true]) {
      expect(parseBridgeMessage(message(data), frame)).toBeNull()
    }
  })

  it('error exige code numérico finito', () => {
    const base = { source: 'ccplay-trailer', v: 1, type: 'error' }
    expect(parseBridgeMessage(message(base), frame)).toBeNull()
    expect(parseBridgeMessage(message({ ...base, code: '150' }), frame)).toBeNull()
    expect(parseBridgeMessage(message({ ...base, code: Number.NaN }), frame)).toBeNull()
    expect(parseBridgeMessage(message({ ...base, code: Number.POSITIVE_INFINITY }), frame)).toBeNull()
  })

  it('ignora campos extras (só a forma conhecida sai)', () => {
    expect(parseBridgeMessage(message({ ...ok, extra: 'x' }), frame)).toEqual(ok)
  })
})
