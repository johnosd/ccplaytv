import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../catalog/db'
import { buildStableId, getUserState, updateProgress } from '../catalog/userStateRepository'
import { createProgressRecorder, type ProgressRecorderIdentity } from './progressRecorder'
import { RESUME_MIN_SECONDS, PROGRESS_WRITE_INTERVAL_SECONDS } from './resumePolicy'

const IDENTITY: ProgressRecorderIdentity = { stableId: 'src1|movie|id:100', sourceId: 'src1' }
const STEP_MS = PROGRESS_WRITE_INTERVAL_SECONDS * 1000
const MIN_MS = RESUME_MIN_SECONDS * 1000

describe('progressRecorder', () => {
  beforeEach(async () => {
    await db.userStates.clear()
  })

  // --- T027: cadência de gravação ---

  it('não grava nada abaixo do limiar inicial (FR-014)', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS - 1000, 600_000)
    await flush()

    expect(await getUserState(IDENTITY.stableId)).toBeUndefined()
  })

  it('grava ao cruzar o limiar inicial', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS, 600_000)
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBe(RESUME_MIN_SECONDS)
  })

  it('grava a cada 5s de avanço, não a cada atualização', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS, 600_000)
    recorder.onProgress(MIN_MS + 1000, 600_000) // avanço menor que o intervalo
    await flush()
    const afterSmallStep = await getUserState(IDENTITY.stableId)
    expect(afterSmallStep?.progressSeconds).toBe(RESUME_MIN_SECONDS) // não regravou

    recorder.onProgress(MIN_MS + STEP_MS, 600_000)
    await flush()
    const afterFullStep = await getUserState(IDENTITY.stableId)
    expect(afterFullStep?.progressSeconds).toBe(RESUME_MIN_SECONDS + PROGRESS_WRITE_INTERVAL_SECONDS)
  })

  it('sair reaplica o mesmo intervalo mínimo — avanço pequeno não força regravação (SC-002 tolera 10s)', async () => {
    // `aoSair` reaplica a MESMA porta de `aoAtualizarPosição` (logic §2): não
    // é um "flush incondicional". A última gravação (30s) já fica a só 2s do
    // ponto real de saída, dentro da tolerância de 10s do SC-002.
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS, 600_000)
    await flush()
    recorder.onProgress(MIN_MS + 2000, 600_000)
    recorder.onExit('pause')
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBe(RESUME_MIN_SECONDS)
  })

  it('grava a posição final ao sair quando o avanço já cruzou o intervalo mínimo', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS, 600_000)
    await flush()
    recorder.onProgress(MIN_MS + STEP_MS, 600_000) // cruza o intervalo — grava aqui mesmo
    recorder.onExit('pause') // reforça a mesma posição ao sair (idempotente)
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBe(RESUME_MIN_SECONDS + PROGRESS_WRITE_INTERVAL_SECONDS)
  })

  it('não grava nada quando nenhum onProgress chegou antes de sair (FR-017)', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onExit('close')
    await flush()

    expect(await getUserState(IDENTITY.stableId)).toBeUndefined()
  })

  it('nunca grava quando reportsPosition é falso (canal ao vivo)', async () => {
    const recorder = createProgressRecorder(IDENTITY, false)

    recorder.onProgress(MIN_MS + STEP_MS, 600_000)
    recorder.onExit('pause')
    await flush()

    expect(await getUserState(IDENTITY.stableId)).toBeUndefined()
  })

  // --- T028: limiar final ---

  it('cruzar 95% apaga o progresso salvo', async () => {
    await updateProgress(IDENTITY.stableId, IDENTITY.sourceId, 200)
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(595_000, 600_000) // > 95% de 600_000

    await flush()
    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBeUndefined()
  })

  it('depois de apagar por limiar final, não regrava enquanto a sessão continua', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(595_000, 600_000) // apaga (>95%)
    await flush()
    recorder.onProgress(598_000, 600_000) // continua tocando os últimos instantes
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBeUndefined()
  })

  it('sem duração conhecida, uma posição grande não é tratada como "passou do fim" — grava normalmente, não apaga', async () => {
    // R0-5/FR-004: `isPastEnd` exige duração conhecida pra decidir "quase no
    // fim". Sem duração, a única forma de apagar é a conclusão REAL do motor
    // — nunca uma posição grande sendo confundida com o fim.
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(999_000, undefined)
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBe(999) // grava normalmente...
    expect(state?.progressSeconds).not.toBeUndefined() // ...em vez de apagar por engano
  })

  it('conclusão (FR-020) apaga o progresso mesmo com duração desconhecida', async () => {
    await updateProgress(IDENTITY.stableId, IDENTITY.sourceId, 200)
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onExit('completed')
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBeUndefined()
  })

  it('depois de concluído, o gravador fica selado — onExit("close") do cleanup não regrava por cima', async () => {
    // Cenário real (US3): `PlayerLayer` chama onExit('completed') e então
    // `onClose()`, que desmonta a camada — o cleanup do efeito roda
    // `teardown()`, que chama onExit('close') de novo sobre o MESMO
    // gravador. Sem o selo, isso reaplicaria a última posição conhecida e
    // ressuscitaria um progresso que acabou de ser apagado.
    await updateProgress(IDENTITY.stableId, IDENTITY.sourceId, 200)
    const recorder = createProgressRecorder(IDENTITY, true)
    recorder.onProgress(590_000, 600_000) // avanço qualquer, antes da conclusão

    recorder.onExit('completed')
    await flush()
    recorder.onExit('close') // o cleanup do React chamaria isto em seguida
    recorder.onProgress(999_000, 600_000) // callback atrasado do motor, se houver
    await flush()

    const state = await getUserState(IDENTITY.stableId)
    expect(state?.progressSeconds).toBeUndefined()
  })

  // --- T030: identidade ---

  it('usa a chave de buildStableId, não uma própria', async () => {
    const identity: ProgressRecorderIdentity = {
      stableId: buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '999' }),
      sourceId: 'src1',
    }
    const recorder = createProgressRecorder(identity, true)

    recorder.onProgress(MIN_MS, 600_000)
    await flush()

    const state = await getUserState('src1|movie|id:999')
    expect(state?.progressSeconds).toBe(RESUME_MIN_SECONDS)
  })

  it('identidade nula (item sem providerStreamId nem originalName) não grava, mas não lança', async () => {
    const recorder = createProgressRecorder(null, true)

    expect(() => {
      recorder.onProgress(MIN_MS + STEP_MS, 600_000)
      recorder.onExit('pause')
    }).not.toThrow()

    await flush()
    // Nada no banco pra qualquer stableId plausível — só confirmamos que a
    // tabela continua vazia, já que não há identidade pra consultar.
    expect(await db.userStates.count()).toBe(0)
  })

  // --- feature 012 (D-007): recordCompletion ---

  describe('com recordCompletion: true (episódio)', () => {
    it('conclusão real grava completedAt em vez de só apagar', async () => {
      await updateProgress(IDENTITY.stableId, IDENTITY.sourceId, 200)
      const recorder = createProgressRecorder(IDENTITY, true, undefined, { recordCompletion: true })

      recorder.onExit('completed')
      await flush()

      const state = await getUserState(IDENTITY.stableId)
      expect(state?.completedAt).toBeDefined()
      expect(state?.progressSeconds).toBeUndefined()
    })

    it('cruzar o limiar final grava completedAt em vez de só apagar', async () => {
      const recorder = createProgressRecorder(IDENTITY, true, undefined, { recordCompletion: true })

      recorder.onProgress(595_000, 600_000) // >95% de 600_000

      await flush()
      const state = await getUserState(IDENTITY.stableId)
      expect(state?.completedAt).toBeDefined()
      expect(state?.progressSeconds).toBeUndefined()
    })
  })

  describe('sem recordCompletion (padrão — filme, comportamento da 011 intacto)', () => {
    it('conclusão real apaga o progresso sem gravar completedAt', async () => {
      await updateProgress(IDENTITY.stableId, IDENTITY.sourceId, 200)
      const recorder = createProgressRecorder(IDENTITY, true)

      recorder.onExit('completed')
      await flush()

      const state = await getUserState(IDENTITY.stableId)
      expect(state?.completedAt).toBeUndefined()
      expect(state?.progressSeconds).toBeUndefined()
    })
  })
})

/** Dá um tick pras Promises internas de `updateProgress`/`clearProgress` resolverem. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
