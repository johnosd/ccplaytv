import { describe, expect, it } from 'vitest'
import type { SourceRecord } from '../catalog/db'
import {
  EPG_STALE_AFTER_MS,
  epgErrorMessage,
  epgManualHostOf,
  epgStatusOf,
  firstEpgUrl,
  isEpgStale,
  isValidEpgUrl,
  resolveEpgUrl,
} from './epgStatus'

const PROVIDER: SourceRecord = {
  id: 's',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'user',
  providerPassword: 'pass',
  connectionState: 'synced',
  createdAt: 1,
  updatedAt: 1,
}

const M3U: SourceRecord = { ...PROVIDER, id: 'm', type: 'm3u_url', providerDns: undefined, providerUsername: undefined, providerPassword: undefined, m3uUrl: 'http://lista.test/avulsa.m3u' }

describe('resolveEpgUrl — precedência (FR-001)', () => {
  it('manual > painel > declarado pela lista', () => {
    expect(resolveEpgUrl({ ...PROVIDER, epgManualUrl: 'http://manual.test/g.xml', epgDeclaredUrl: 'http://decl.test/g.xml' })).toEqual({
      url: 'http://manual.test/g.xml',
      origin: 'manual',
    })

    const panel = resolveEpgUrl({ ...PROVIDER, epgDeclaredUrl: 'http://decl.test/g.xml' })
    expect(panel?.origin).toBe('panel')
    const url = new URL(panel!.url)
    expect(`${url.origin}${url.pathname}`).toBe('http://painel.test/xmltv.php')
    expect(url.searchParams.get('username')).toBe('user')

    expect(resolveEpgUrl({ ...M3U, epgDeclaredUrl: 'http://decl.test/g.xml' })).toEqual({ url: 'http://decl.test/g.xml', origin: 'playlist' })
  })

  it('M3U com formato de painel usa o xmltv.php do painel', () => {
    const panelM3u: SourceRecord = { ...M3U, m3uUrl: 'http://painel.test/get.php?username=u&password=p&type=m3u_plus' }
    expect(resolveEpgUrl(panelM3u)?.origin).toBe('panel')
  })

  it('sem nenhum endereço = não configurado', () => {
    expect(resolveEpgUrl(M3U)).toBeUndefined()
    expect(epgStatusOf(M3U).state).toBe('not_configured')
  })
})

describe('epgStatusOf (data-model §1)', () => {
  it('desativado ganha de tudo', () => {
    expect(epgStatusOf({ ...PROVIDER, epgDisabled: true, epgLastSyncAt: 5 }).state).toBe('disabled')
  })

  it('nunca sincronizado → vinculado → erro depois do último sucesso', () => {
    expect(epgStatusOf(PROVIDER).state).toBe('never_synced')
    expect(epgStatusOf({ ...PROVIDER, epgLastSyncAt: 10 })).toMatchObject({ state: 'linked', lastSyncAt: 10, urlOrigin: 'panel' })
    expect(epgStatusOf({ ...PROVIDER, epgLastSyncAt: 10, epgLastErrorKind: 'network', epgLastErrorAt: 20 })).toMatchObject({
      state: 'error',
      errorKind: 'network',
      lastSyncAt: 10,
    })
  })

  it('erro anterior ao último sucesso não conta', () => {
    expect(epgStatusOf({ ...PROVIDER, epgLastSyncAt: 30, epgLastErrorKind: 'network', epgLastErrorAt: 20 }).state).toBe('linked')
  })

  it('deslocamento padrão 0', () => {
    expect(epgStatusOf(PROVIDER).offsetHours).toBe(0)
    expect(epgStatusOf({ ...PROVIDER, epgOffsetHours: -3 }).offsetHours).toBe(-3)
  })
})

describe('endereços', () => {
  it('epgManualHostOf devolve só o hostname (FR-017)', () => {
    expect(epgManualHostOf({ ...PROVIDER, epgManualUrl: 'https://guia.exemplo.org/a/b.xml?token=x' })).toBe('guia.exemplo.org')
    expect(epgManualHostOf(PROVIDER)).toBeUndefined()
  })

  it('isValidEpgUrl exige http(s) sem espaços (FR-018)', () => {
    expect(isValidEpgUrl('http://a.test/g.xml')).toBe(true)
    expect(isValidEpgUrl('https://a.test')).toBe(true)
    expect(isValidEpgUrl('abc')).toBe(false)
    expect(isValidEpgUrl('ftp://a.test/g.xml')).toBe(false)
    expect(isValidEpgUrl('http://a.test/g x.xml')).toBe(false)
    expect(isValidEpgUrl('   ')).toBe(false)
  })

  it('firstEpgUrl pega o primeiro válido de uma lista separada por vírgula', () => {
    expect(firstEpgUrl('lixo, http://a.test/1.xml, http://b.test/2.xml')).toBe('http://a.test/1.xml')
    expect(firstEpgUrl('')).toBeUndefined()
    expect(firstEpgUrl(undefined)).toBeUndefined()
  })
})

describe('isEpgStale (FR-009)', () => {
  const now = 1_000_000_000_000
  it('sem endereço ou desativado nunca é devido; sem sincronização anterior é; depois de 12 h é', () => {
    expect(isEpgStale(M3U, now)).toBe(false)
    expect(isEpgStale({ ...PROVIDER, epgDisabled: true }, now)).toBe(false)
    expect(isEpgStale(PROVIDER, now)).toBe(true)
    expect(isEpgStale({ ...PROVIDER, epgLastSyncAt: now - EPG_STALE_AFTER_MS + 1000 }, now)).toBe(false)
    expect(isEpgStale({ ...PROVIDER, epgLastSyncAt: now - EPG_STALE_AFTER_MS - 1000 }, now)).toBe(true)
  })
})

describe('epgErrorMessage (§45)', () => {
  it('tem texto para cada categoria e nunca menciona endereço', () => {
    for (const kind of ['network', 'refused', 'not_xmltv', 'unreadable', 'storage_full'] as const) {
      expect(epgErrorMessage(kind).length).toBeGreaterThan(10)
      expect(epgErrorMessage(kind)).not.toMatch(/https?:\/\//)
    }
  })
})
