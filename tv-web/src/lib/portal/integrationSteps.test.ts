import { beforeEach, expect, it, vi } from 'vitest'
import type { CatalogDb } from '../catalog/db'
import { createIntegrationSteps } from './integrationSteps'
import type { PortalConnection } from './portalConnection'

// Feature 091 (D-004): TMDB e legendas são passos independentes dentro do mesmo `integrations`.
const mocks = vi.hoisted(() => ({ tmdb: vi.fn(), subtitles: vi.fn() }))
vi.mock('./tmdbRemote', () => ({ createTmdbRemoteStep: () => mocks.tmdb }))
vi.mock('./subtitleKeysRemote', () => ({ createSubtitleKeysRemoteStep: () => mocks.subtitles }))

const signal = new AbortController().signal
const build = () => createIntegrationSteps({} as CatalogDb, {} as PortalConnection)
beforeEach(() => { mocks.tmdb.mockReset().mockResolvedValue('none'); mocks.subtitles.mockReset().mockResolvedValue({}) })

it('Atualizar do card TMDB e o de listas aplicam os dois; o da seção Legendas, só as de legenda', async () => {
  await build()(signal)
  expect(mocks.tmdb).toHaveBeenCalledOnce(); expect(mocks.subtitles).toHaveBeenCalledOnce()
  mocks.tmdb.mockClear(); mocks.subtitles.mockClear()
  await build()(signal, 'subtitles')
  expect(mocks.tmdb).not.toHaveBeenCalled(); expect(mocks.subtitles).toHaveBeenCalledOnce()
})

it('a falha de um passo não impede o outro, e o erro sobe depois dos dois', async () => {
  mocks.tmdb.mockRejectedValue(new Error('tmdb_apply_failed'))
  await expect(build()(signal)).rejects.toThrow('tmdb_apply_failed')
  expect(mocks.subtitles).toHaveBeenCalledOnce()
  mocks.tmdb.mockReset().mockResolvedValue('none')
  mocks.subtitles.mockRejectedValue(new Error('subtitle_apply_failed'))
  await expect(build()(signal)).rejects.toThrow('subtitle_apply_failed')
  expect(mocks.tmdb).toHaveBeenCalledOnce()
})

it('cancelamento do Atualizar não é "falha de integração": propaga na hora e não tenta o próximo passo', async () => {
  const controller = new AbortController()
  mocks.tmdb.mockImplementation(async () => { controller.abort(); throw new DOMException('aborted', 'AbortError') })
  await expect(build()(controller.signal)).rejects.toThrow()
  expect(mocks.subtitles).not.toHaveBeenCalled()
})
