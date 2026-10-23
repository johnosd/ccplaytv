import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ connection: undefined as unknown, visible: false, keys: {} as Record<string, string>, allowed: true }))

vi.mock('../portal/portalRuntime', () => ({
  getPortalConnection: () => state.connection,
  portalSurfacesVisible: () => state.visible,
}))
vi.mock('../licensing/licenseRuntime', () => ({
  commercialBuild: true,
  licenseMonitor: { check: () => ({ allowed: state.allowed }) },
}))
vi.mock('./subtitleCredentials', () => ({
  readChosenSubtitleKeys: async () => state.keys,
  markSubtitleKeyState: async () => {},
  setSubtitleKeyChosen: async () => {},
}))
vi.mock('./subtitleTarget', () => ({
  resolveSubtitleTarget: vi.fn(async (itemId: string) => ({ stableId: `src|movie|${itemId}`, sourceId: 'src', kind: 'movie', title: 'Filme' })),
}))

async function freshRuntime() {
  vi.resetModules()
  return import('./runtime')
}

beforeEach(() => {
  state.connection = undefined
  state.visible = false
  state.keys = {}
  state.allowed = true
})

describe('padrão de produção das legendas externas', () => {
  it('build base sem portal e sem chave pessoal: a opção não existe (alvo nulo, nada de "em breve")', async () => {
    const deps = (await freshRuntime()).defaultExternalSubtitles()
    expect(deps).not.toBeNull()
    expect(await deps?.resolveTarget('item-1')).toBeNull()
    expect(deps?.access?.()).toBe('not_entitled')
    expect(deps?.useDefault).toBeUndefined()
  })

  it('build base com chave pessoal: a opção existe e só ela é usada (sem "usar o padrão")', async () => {
    state.keys = { subdl: 'chave-pessoal-ficticia-090' }
    const deps = (await freshRuntime()).defaultExternalSubtitles()
    expect(await deps?.resolveTarget('item-1')).toMatchObject({ kind: 'movie' })
    expect(deps?.access?.()).toBe('allowed')
    expect(deps?.useDefault).toBeUndefined()
  })

  it('com portal e licença: o padrão existe; sem licença e sem chave pessoal vira "not_entitled"', async () => {
    state.connection = { ready: async () => ({ bearer: 'x' }), client: { request: vi.fn() } }
    state.visible = true
    const deps = (await freshRuntime()).defaultExternalSubtitles()
    expect(await deps?.resolveTarget('item-1')).toMatchObject({ kind: 'movie' })
    expect(deps?.access?.()).toBe('allowed')
    expect(deps?.useDefault).toBeTypeOf('function')
    state.allowed = false
    expect(deps?.access?.()).toBe('not_entitled')
  })
})
