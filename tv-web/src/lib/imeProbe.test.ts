import { afterEach, describe, expect, it } from 'vitest'
import { clearImeProbe, getImeProbeEntries, IME_PROBE_LIMIT, recordImeProbe, startImeProbe } from './imeProbe'

describe('imeProbe', () => {
  afterEach(() => {
    clearImeProbe()
    document.body.innerHTML = ''
  })

  it('guarda tecla e alvo, nunca o valor do campo', () => {
    const input = document.createElement('input')
    input.id = 'campo-senha'
    input.value = 'segredo-123'
    document.body.append(input)
    const stop = startImeProbe()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 65376, bubbles: true }))
    stop()

    const [entry] = getImeProbeEntries()
    expect(entry).toMatchObject({ type: 'keydown', keyCode: 65376, target: 'input#campo-senha' })
    expect(JSON.stringify(getImeProbeEntries())).not.toContain('segredo-123')
  })

  it('mantém só os últimos eventos', () => {
    for (let i = 0; i < IME_PROBE_LIMIT + 5; i += 1) {
      recordImeProbe(new KeyboardEvent('keydown', { key: 'a', keyCode: i }))
    }
    const entries = getImeProbeEntries()
    expect(entries).toHaveLength(IME_PROBE_LIMIT)
    expect(entries[entries.length - 1].keyCode).toBe(IME_PROBE_LIMIT + 4)
  })

  it('para de registrar depois de desligar', () => {
    const stop = startImeProbe()
    stop()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(getImeProbeEntries()).toHaveLength(0)
  })
})
