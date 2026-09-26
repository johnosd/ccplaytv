import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAVORITE_COLOR_KEY, registerFavoriteColorKey } from './tizenColorKey'

describe('registerFavoriteColorKey', () => {
  afterEach(() => {
    // @ts-expect-error -- propriedade injetada só em runtime Tizen real
    delete window.tizen
  })

  it('não lança erro quando window.tizen não existe (navegador de desenvolvimento)', () => {
    expect(() => registerFavoriteColorKey()).not.toThrow()
  })

  it('registra a tecla amarela quando getSupportedKeys a lista', () => {
    const registerKey = vi.fn()
    const getSupportedKeys = vi.fn(() => [
      { name: 'MediaPlayPause', code: 10252 },
      { name: FAVORITE_COLOR_KEY, code: 405 },
    ])
    // @ts-expect-error -- mock mínimo da Web API do Tizen
    window.tizen = { tvinputdevice: { registerKey, getSupportedKeys } }

    registerFavoriteColorKey()

    expect(registerKey).toHaveBeenCalledWith(FAVORITE_COLOR_KEY)
  })

  it('não registra quando getSupportedKeys não lista a tecla amarela', () => {
    const registerKey = vi.fn()
    const getSupportedKeys = vi.fn(() => [{ name: 'MediaPlayPause', code: 10252 }])
    // @ts-expect-error -- mock mínimo da Web API do Tizen
    window.tizen = { tvinputdevice: { registerKey, getSupportedKeys } }

    registerFavoriteColorKey()

    expect(registerKey).not.toHaveBeenCalled()
  })

  it('registra mesmo sem getSupportedKeys disponível (plataforma que não a expõe)', () => {
    const registerKey = vi.fn()
    // @ts-expect-error -- mock mínimo da Web API do Tizen
    window.tizen = { tvinputdevice: { registerKey } }

    registerFavoriteColorKey()

    expect(registerKey).toHaveBeenCalledWith(FAVORITE_COLOR_KEY)
  })

  it('uma falha de registro (privilégio ausente, TV antiga) não lança erro', () => {
    const registerKey = vi.fn(() => {
      throw new Error('privilege denied')
    })
    // @ts-expect-error -- mock mínimo da Web API do Tizen
    window.tizen = { tvinputdevice: { registerKey } }

    expect(() => registerFavoriteColorKey()).not.toThrow()
  })
})
