import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRemoveColorKeyRegistered, registerRemoveColorKey, REMOVE_COLOR_KEY } from './tizenColorKey'

function installTizen(tvinputdevice: object) {
  ;(window as unknown as { tizen?: object }).tizen = { tvinputdevice }
}

describe('registerRemoveColorKey (estrito, feature 036 D-007)', () => {
  afterEach(() => {
    delete (window as unknown as { tizen?: object }).tizen
    registerRemoveColorKey() // volta o estado do módulo para "não registrada"
  })

  it('fora da TV não registra e não lança', () => {
    expect(registerRemoveColorKey()).toBe(false)
    expect(isRemoveColorKeyRegistered()).toBe(false)
  })

  it('registra só quando getSupportedKeys lista a vermelha', () => {
    const registerKey = vi.fn()
    installTizen({ registerKey, getSupportedKeys: () => [{ name: REMOVE_COLOR_KEY, code: 403 }] })

    expect(registerRemoveColorKey()).toBe(true)
    expect(registerKey).toHaveBeenCalledWith(REMOVE_COLOR_KEY)
    expect(isRemoveColorKeyRegistered()).toBe(true)
  })

  it('lista vazia, ausente ou sem a vermelha: não registra (diferente da amarela)', () => {
    const registerKey = vi.fn()
    installTizen({ registerKey, getSupportedKeys: () => [] })
    expect(registerRemoveColorKey()).toBe(false)

    installTizen({ registerKey })
    expect(registerRemoveColorKey()).toBe(false)

    installTizen({ registerKey, getSupportedKeys: () => [{ name: 'ColorF2Yellow', code: 405 }] })
    expect(registerRemoveColorKey()).toBe(false)

    expect(registerKey).not.toHaveBeenCalled()
    expect(isRemoveColorKeyRegistered()).toBe(false)
  })

  it('falha de registro não lança e deixa a dica desligada', () => {
    installTizen({
      registerKey: () => {
        throw new Error('privilege denied')
      },
      getSupportedKeys: () => [{ name: REMOVE_COLOR_KEY, code: 403 }],
    })
    expect(registerRemoveColorKey()).toBe(false)
    expect(isRemoveColorKeyRegistered()).toBe(false)
  })
})
