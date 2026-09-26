import { describe, expect, it } from 'vitest'
import {
  REDUCED_MOTION_CLASS,
  applyMotionPreference,
  writeReducedMotionPreference,
  type PreferenceStorage,
} from './motionPreference'

function memoryStorage(): PreferenceStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('021 — preferência interna de reduzir movimento', () => {
  // US4/AC2–AC3 · FR-018, FR-019 · edge case "armazenamento bloqueado ou cheio"
  it('preferência persistida liga/desliga a classe; armazenamento bloqueado não lança e não aplica', () => {
    const storage = memoryStorage()
    const root = document.createElement('div')

    applyMotionPreference(root, storage)
    expect(root.classList.contains(REDUCED_MOTION_CLASS)).toBe(false)

    writeReducedMotionPreference(true, storage)
    applyMotionPreference(root, storage)
    expect(root.classList.contains(REDUCED_MOTION_CLASS)).toBe(true)

    writeReducedMotionPreference(false, storage)
    applyMotionPreference(root, storage)
    expect(root.classList.contains(REDUCED_MOTION_CLASS)).toBe(false)

    const blocked: PreferenceStorage = {
      getItem: () => {
        throw new DOMException('bloqueado', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('cheio', 'QuotaExceededError')
      },
    }
    const other = document.createElement('div')
    expect(() => writeReducedMotionPreference(true, blocked)).not.toThrow()
    expect(() => applyMotionPreference(other, blocked)).not.toThrow()
    expect(other.classList.contains(REDUCED_MOTION_CLASS)).toBe(false)
  })
})
