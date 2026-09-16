import { afterEach, describe, expect, it, vi } from 'vitest'
import { exitApp } from './tizenExit'

describe('exitApp', () => {
  afterEach(() => {
    // @ts-expect-error -- propriedade injetada só em runtime Tizen real
    delete window.tizen
  })

  it('chama tizen.application.getCurrentApplication().exit() quando window.tizen existe', () => {
    const exit = vi.fn()
    const getCurrentApplication = vi.fn(() => ({ exit }))
    // @ts-expect-error -- mock mínimo da Web API do Tizen
    window.tizen = { application: { getCurrentApplication } }

    exitApp()

    expect(getCurrentApplication).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('não lança erro quando window.tizen não existe (navegador de desenvolvimento)', () => {
    expect(() => exitApp()).not.toThrow()
  })
})
