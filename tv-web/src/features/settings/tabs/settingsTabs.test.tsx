import { afterEach, describe, expect, it, vi } from 'vitest'
import { portalSurfacesVisible } from '../../../lib/portal/portalRuntime'
import { settingsTabsFor } from './settingsTabs'

afterEach(() => {
  vi.unstubAllEnvs()
})

// Feature 078: o build de loja sem portal (variante base) não mostra recurso "ainda não disponível".
describe('superfícies do portal por build', () => {
  it('sem portal, as abas Portal & licença e Backup somem; o resto fica na mesma ordem', () => {
    expect(settingsTabsFor(false).map((tab) => tab.id)).toEqual(['integrations', 'sources', 'player', 'accessibility', 'about'])
    expect(settingsTabsFor(true).map((tab) => tab.id)).toEqual(['integrations', 'sources', 'player', 'accessibility', 'about', 'portal', 'backup'])
  })

  it('só o build de produção sem VITE_PORTAL_ORIGIN esconde; dev/testes e o build com portal mostram', () => {
    vi.stubEnv('VITE_PORTAL_ORIGIN', '')
    expect(portalSurfacesVisible()).toBe(true) // testes rodam com PROD falso
    vi.stubEnv('PROD', true)
    expect(portalSurfacesVisible()).toBe(false)
    vi.stubEnv('VITE_PORTAL_ORIGIN', 'https://portal.fixture.test')
    expect(portalSurfacesVisible()).toBe(true)
  })
})
