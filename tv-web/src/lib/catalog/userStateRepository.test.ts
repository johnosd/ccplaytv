import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  buildStableId,
  clearProgress,
  getUserState,
  getUserStates,
  markCompleted,
  toggleFavorite,
  updateProgress,
  getGlobalFavorites,
  getContinueWatching,
} from './userStateRepository'

const MATRIX = { sourceId: 'src1', kind: 'movie', providerStreamId: '100' } as const
const AVATAR = { sourceId: 'src2', kind: 'movie', providerStreamId: '200' } as const
const DUNE = { sourceId: 'src1', kind: 'movie', providerStreamId: '300' } as const

describe('userStateRepository', () => {
  beforeEach(async () => {
    await db.userStates.clear()
  })

  describe('buildStableId', () => {
    it('usa o identificador do painel, não o nome exibido', () => {
      // O provedor renomear o título não pode apagar favorito nem progresso:
      // é o que a constitution exige ao chavear por identidade estável.
      const antes = buildStableId({ ...MATRIX, originalName: 'Die Hard' })
      const depois = buildStableId({ ...MATRIX, originalName: 'Die Hard (1988)' })

      expect(antes).toBe(depois)
      expect(antes).toBe('src1|movie|id:100')
    })

    it('separa episódios homônimos por temporada e episódio', () => {
      const base = { sourceId: 'src1', kind: 'episode', seriesId: '7' } as const
      const s01e01 = buildStableId({ ...base, seasonNumber: 1, episodeNumber: 1 })
      const s02e01 = buildStableId({ ...base, seasonNumber: 2, episodeNumber: 1 })

      expect(s01e01).not.toBe(s02e01)
      expect(s01e01).toBe('src1|episode|id:7|s1|e1')
    })

    it('cai no nome só quando a fonte não traz identificador (lista M3U)', () => {
      const id = buildStableId({ sourceId: 'src1', kind: 'movie', originalName: ' The Matrix ' })
      expect(id).toBe('src1|movie|name:the matrix')
    })

    it('recusa item sem identidade alguma, em vez de inventar uma chave', () => {
      expect(() => buildStableId({ sourceId: 'src1', kind: 'movie' })).toThrow()
    })

    it('não mistura itens de fontes diferentes com o mesmo identificador', () => {
      expect(buildStableId(MATRIX)).not.toBe(buildStableId({ ...MATRIX, sourceId: 'src2' }))
    })
  })

  it('should return undefined if state does not exist', async () => {
    const state = await getUserState('unknown_id')
    expect(state).toBeUndefined()
  })

  it('should toggle favorite for new state', async () => {
    const stableId = buildStableId(MATRIX)
    await toggleFavorite(stableId, 'src1', true)

    const state = await getUserState(stableId)
    expect(state).toBeDefined()
    expect(state?.isFavorite).toBe(true)
    expect(state?.sourceId).toBe('src1')
  })

  it('should toggle favorite for existing state', async () => {
    const stableId = buildStableId(MATRIX)
    await toggleFavorite(stableId, 'src1', true)
    await toggleFavorite(stableId, 'src1', false)

    const state = await getUserState(stableId)
    expect(state?.isFavorite).toBe(false)
    // Sem instante, o registro sai do índice — é assim que a consulta de
    // favoritos deixa de encontrá-lo.
    expect(state?.favoritedAt).toBeUndefined()
  })

  it('should update progress for new state', async () => {
    const stableId = buildStableId(MATRIX)
    await updateProgress(stableId, 'src1', 120)

    const state = await getUserState(stableId)
    expect(state?.progressSeconds).toBe(120)
    expect(state?.lastWatched).toBeDefined()
    expect(state?.isFavorite).toBe(false)
  })

  it('should update progress for existing state', async () => {
    const stableId = buildStableId(MATRIX)
    await toggleFavorite(stableId, 'src1', true)

    await updateProgress(stableId, 'src1', 300)

    const state = await getUserState(stableId)
    expect(state?.isFavorite).toBe(true) // Should preserve favorite
    expect(state?.progressSeconds).toBe(300)
    expect(state?.lastWatched).toBeDefined()
  })

  it('favoritar e salvar progresso ao mesmo tempo não estoura nem perde um dos dois', async () => {
    const stableId = buildStableId(MATRIX)

    // Sem transação, as duas leituras encontravam o registro ausente e as
    // duas tentavam inserir — a segunda quebrava com ConstraintError.
    await Promise.all([
      toggleFavorite(stableId, 'src1', true),
      updateProgress(stableId, 'src1', 42),
    ])

    const state = await getUserState(stableId)
    expect(state?.isFavorite).toBe(true)
    expect(state?.progressSeconds).toBe(42)
  })

  it('clearProgress apaga a posição, mas preserva o favorito (feature 011)', async () => {
    const stableId = buildStableId(MATRIX)
    await toggleFavorite(stableId, 'src1', true)
    await updateProgress(stableId, 'src1', 300)

    await clearProgress(stableId, 'src1')

    const state = await getUserState(stableId)
    expect(state?.progressSeconds).toBeUndefined()
    expect(state?.isFavorite).toBe(true) // não é apagar o registro, só o progresso
  })

  describe('markCompleted (feature 012, D-007)', () => {
    it('grava completedAt e apaga a posição de retomada', async () => {
      const stableId = buildStableId({ ...MATRIX, kind: 'episode' })
      await updateProgress(stableId, 'src1', 300)

      await markCompleted(stableId, 'src1')

      const state = await getUserState(stableId)
      expect(state?.completedAt).toBeDefined()
      expect(state?.progressSeconds).toBeUndefined()
    })

    it('gravar progresso depois de concluído não apaga completedAt — os dois convivem', async () => {
      const stableId = buildStableId({ ...MATRIX, kind: 'episode' })
      await markCompleted(stableId, 'src1')
      const completedAt = (await getUserState(stableId))?.completedAt

      await updateProgress(stableId, 'src1', 40) // reassistindo, parou no meio

      const state = await getUserState(stableId)
      expect(state?.completedAt).toBe(completedAt)
      expect(state?.progressSeconds).toBe(40)
    })
  })

  describe('getUserStates (feature 012)', () => {
    it('devolve os estados na mesma ordem pedida, undefined pra id sem registro', async () => {
      const matrixId = buildStableId(MATRIX)
      const duneId = buildStableId(DUNE)
      await toggleFavorite(matrixId, 'src1', true)

      const [matrixState, unknownState, duneState] = await getUserStates([matrixId, 'src1|movie|id:999', duneId])

      expect(matrixState?.isFavorite).toBe(true)
      expect(unknownState).toBeUndefined()
      expect(duneState).toBeUndefined()
    })

    it('lista vazia devolve lista vazia, sem lançar', async () => {
      expect(await getUserStates([])).toEqual([])
    })
  })

  it('clearProgress num item sem estado prévio não lança e não cria progresso', async () => {
    const stableId = buildStableId(MATRIX)

    await expect(clearProgress(stableId, 'src1')).resolves.toBeUndefined()

    const state = await getUserState(stableId)
    expect(state?.progressSeconds).toBeUndefined()
  })

  it('should fetch global favorites across sources', async () => {
    await toggleFavorite(buildStableId(MATRIX), 'src1', true)
    await toggleFavorite(buildStableId(AVATAR), 'src2', true)
    await toggleFavorite(buildStableId(DUNE), 'src1', false)

    const favs = await getGlobalFavorites()
    expect(favs).toHaveLength(2)
    expect(favs.map((f) => f.sourceId).sort()).toEqual(['src1', 'src2'])
  })

  it('should fetch continue watching across sources', async () => {
    await updateProgress(buildStableId(MATRIX), 'src1', 120)
    await updateProgress(buildStableId(AVATAR), 'src2', 300)

    const cw = await getContinueWatching()
    expect(cw).toHaveLength(2)
    expect(cw[0].lastWatched ?? 0).toBeGreaterThanOrEqual(cw[1].lastWatched ?? 0)
  })
})
