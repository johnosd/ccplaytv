import { describe, expect, it, vi } from 'vitest'
import { parseNav, pushNav, ROOT, root, sameNav, type HistoryLike } from './navigation'

describe('navegação do portal (feature 077, D-002)', () => {
  const location = { pathname: '/', search: '?x=1' }

  it('empilha com a MESMA URL e não empilha estado igual', () => {
    const history: HistoryLike = { pushState: vi.fn() }
    expect(pushNav(history, location, ROOT, root('license'))).toBe(true)
    expect(history.pushState).toHaveBeenCalledWith({ destination: 'license', view: '' }, '', '/?x=1')
    expect(pushNav(history, location, root('license'), root('license'))).toBe(false)
    expect(history.pushState).toHaveBeenCalledTimes(1)
    expect(pushNav(history, location, root('settings'), { destination: 'settings', view: 'backup' })).toBe(true)
    expect(sameNav(root('lists'), { destination: 'lists', view: 'editor' })).toBe(false)
  })

  it('só aceita no popstate o estado que este módulo gravou', () => {
    expect(parseNav({ destination: 'settings', view: 'tmdb' })).toEqual({ destination: 'settings', view: 'tmdb' })
    expect(parseNav({ destination: 'lists', view: '' })).toEqual(ROOT)
    for (const bad of [null, undefined, 'x', 3, {}, { destination: 'sellers', view: '' }, { destination: 'lists' }, { destination: 'lists', view: 'Editor!' },
      { destination: 'lists', view: 'a'.repeat(40) }, { destination: 'lists', view: 7 }]) expect(parseNav(bad)).toBeUndefined()
  })
})
