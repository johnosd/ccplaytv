import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { checkPackage, parseTizenConfig } from './packageChecks.mjs'

const realConfig = readFileSync(new URL('../../../CCPlayTv/config.xml', import.meta.url), 'utf8')
const statusOf = (results, id) => results.find((r) => r.id === id)?.status
const FILES = ['config.xml', 'author-signature.xml', 'signature1.xml']

it('parseTizenConfig lê o config.xml real do projeto Tizen', () => {
  const config = parseTizenConfig(realConfig)
  expect(config.tizenId).toBe('8tZqMtwANL.CCPlayTv')
  expect(config.packageId).toBe('8tZqMtwANL')
  expect(config.requiredVersion).toBe('8.0')
  expect(config.name).toBe('CCPlayTV')
  expect(config.privileges).toHaveLength(6)
  expect(config.features.some((name) => name.startsWith('http://tizen.org/feature/screen.size.'))).toBe(true)
})

it('required_version acima do piso passa; Tizen ID diferente do publicado bloqueia', () => {
  const base = { configXml: realConfig, packageFiles: FILES, runtimeFloor: '8.0', buildType: 'Release', storeTitle: 'CCPlayTV' }
  expect(statusOf(checkPackage(base), 'SAM-CFG-APIVERSION')).toBe('Pass')
  expect(statusOf(checkPackage({ ...base, configXml: realConfig.replace('required_version="8.0"', 'required_version="10.0"') }), 'SAM-CFG-APIVERSION')).toBe('Pass')
  expect(statusOf(checkPackage({ ...base, publishedTizenId: '8tZqMtwANL.CCPlayTv' }), 'SAM-CFG-TIZENID')).toBe('Pass')
  expect(statusOf(checkPackage({ ...base, publishedTizenId: 'Outro12345X.CCPlayTv' }), 'SAM-CFG-TIZENID')).toBe('Blocked')
  expect(statusOf(checkPackage({ ...base, storeTitle: undefined }), 'SAM-CFG-TITLE')).toBe('Pending')
})

it('config.xml vazio ou sem campos bloqueia em vez de lançar', () => {
  const results = checkPackage({ configXml: '', packageFiles: [], runtimeFloor: '8.0', buildType: 'Release' })
  for (const id of ['SAM-PKG-FILES', 'SAM-CFG-TIZENID', 'SAM-CFG-PACKAGEID', 'SAM-CFG-VERSION', 'SAM-CFG-APIVERSION', 'SAM-CFG-SCREENSIZE']) {
    expect(statusOf(results, id), id).toBe('Blocked')
  }
})
