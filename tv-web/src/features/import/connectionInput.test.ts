import { describe, expect, it, vi } from 'vitest'
import { connectionInputFor, type ConnectionDraft } from './connectionInput'

const stored = { dns: 'http://prov.test', username: 'guardado', password: 'senha-guardada' }
const readCredential = vi.fn(async () => stored)

const draft = (overrides: Partial<ConnectionDraft> = {}): ConnectionDraft => ({
  mode: 'provider',
  m3uUrl: '',
  dns: 'http://prov.test',
  username: '',
  password: '',
  ...overrides,
})

describe('connectionInputFor', () => {
  it('cadastro Xtream: sempre confirma, com os campos digitados', async () => {
    expect(await connectionInputFor(draft({ username: 'u', password: 'p' }))).toEqual({
      type: 'provider_credentials',
      dns: 'http://prov.test',
      username: 'u',
      password: 'p',
    })
  })

  it('cadastro M3U: confirma a URL; em branco não há o que confirmar', async () => {
    expect(await connectionInputFor(draft({ mode: 'url', m3uUrl: ' http://l.test/x.m3u ' }))).toEqual({
      type: 'm3u_url',
      url: 'http://l.test/x.m3u',
    })
    expect(await connectionInputFor(draft({ mode: 'url', m3uUrl: '  ' }))).toBeNull()
  })

  it('edição Xtream só com o nome mudado (endereço igual, usuário e senha em branco): não consulta a rede', async () => {
    readCredential.mockClear()
    const input = await connectionInputFor(draft(), { id: 's1', providerDns: 'http://prov.test' }, readCredential)
    expect(input).toBeNull()
    expect(readCredential).not.toHaveBeenCalled()
  })

  it('edição Xtream com o endereço novo e usuário/senha em branco: completa pelo que está guardado', async () => {
    const input = await connectionInputFor(
      draft({ dns: 'http://novo.test' }),
      { id: 's1', providerDns: 'http://prov.test' },
      readCredential,
    )
    expect(input).toEqual({
      type: 'provider_credentials',
      dns: 'http://novo.test',
      username: 'guardado',
      password: 'senha-guardada',
    })
  })

  it('edição Xtream com só a senha nova: mantém o usuário guardado', async () => {
    const input = await connectionInputFor(
      draft({ password: 'nova' }),
      { id: 's1', providerDns: 'http://prov.test' },
      readCredential,
    )
    expect(input).toMatchObject({ username: 'guardado', password: 'nova' })
  })

  it('credencial guardada sumiu e há campo em branco: devolve null, nunca inventa', async () => {
    const input = await connectionInputFor(
      draft({ dns: 'http://novo.test' }),
      { id: 's1', providerDns: 'http://prov.test' },
      vi.fn(async () => undefined),
    )
    expect(input).toBeNull()
  })
})
