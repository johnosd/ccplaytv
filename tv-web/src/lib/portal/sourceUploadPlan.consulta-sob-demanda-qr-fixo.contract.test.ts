import { expect, it } from 'vitest'
import { planSourceUploads, type UploadableSource } from './sourceUploadPlan'

// US4/AC1-AC3, FR-008, FR-009, FR-010 — primeira atualização sobe todas as listas completas; depois só o que mudou
it('envio TV → site: a 1ª vez sobe todas as listas completas; depois só as com revisão nova; incompletas não sobem', () => {
  const sources: UploadableSource[] = [
    { id: 'a', type: 'provider_credentials', displayName: 'A', providerDns: 'https://painel.invalid:8080',
      providerUsername: 'usuario-fixture', providerPassword: 'senha-fixture', revision: 1 },
    { id: 'b', type: 'm3u_url', displayName: 'B', m3uUrl: 'https://lista.invalid/b.m3u', revision: 3 },
    { id: 'c', type: 'provider_credentials', displayName: 'C incompleta', providerDns: 'https://painel.invalid',
      providerUsername: 'usuario-fixture', revision: 1 },
  ]

  const first = planSourceUploads({ sources, uploaded: {} })
  expect(first.map(item => item.sourceId)).toEqual(['a', 'b'])
  expect(first[0]).toMatchObject({ type: 'provider_credentials', displayName: 'A', revision: 1,
    providerDns: 'https://painel.invalid:8080', providerUsername: 'usuario-fixture', providerPassword: 'senha-fixture' })
  expect(first[1]).toMatchObject({ type: 'm3u_url', displayName: 'B', revision: 3, m3uUrl: 'https://lista.invalid/b.m3u' })

  expect(planSourceUploads({ sources, uploaded: { a: 1, b: 2 } }).map(item => item.sourceId)).toEqual(['b'])
  expect(planSourceUploads({ sources, uploaded: { a: 1, b: 3 } })).toEqual([])
})