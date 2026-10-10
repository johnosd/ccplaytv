import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../catalog/db'
import { getUserState } from '../catalog/userStateRepository'
import { createProgressRecorder, settleExit, type ProgressRecorderIdentity } from './progressRecorder'
import { subscribeProgressSettled } from './progressSettled'
import { RESUME_MIN_SECONDS } from './resumePolicy'

/**
 * Bug `filmes-no-salvam-progresso-reproduo-nem`: uma gravação de progresso que falha nunca some em silêncio — vira um
 * código curto (`PRG-W-…`), a próxima oportunidade tenta de novo e, ao sair, quem lê o estado é avisado DEPOIS da escrita.
 */

const IDENTITY: ProgressRecorderIdentity = { stableId: 'src1|movie|id:200', sourceId: 'src1' }
const MIN_MS = RESUME_MIN_SECONDS * 1000
const DURATION_MS = 7_200_000

/** Faz a próxima gravação em `userStates` falhar como a cota estourada falharia (nome real da exceção do IndexedDB). */
function failNextWrites(count: number, name = 'QuotaExceededError') {
  const original = db.userStates.put.bind(db.userStates)
  let remaining = count
  return vi.spyOn(db.userStates, 'put').mockImplementation(((...args: Parameters<typeof original>) => {
    if (remaining > 0) {
      remaining -= 1
      return Promise.reject(Object.assign(new Error('mensagem que nunca pode aparecer: http://painel/secreto'), { name }))
    }
    return original(...args)
  }) as typeof db.userStates.put)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('progressRecorder — falha de escrita', () => {
  beforeEach(async () => {
    await db.userStates.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('não vira rejeição solta: guarda um código seguro (sem a mensagem da exceção) e o entrega uma vez só', async () => {
    failNextWrites(1)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS, DURATION_MS)
    await settle()
    process.off('unhandledRejection', unhandled)

    expect(unhandled).not.toHaveBeenCalled()
    const code = recorder.takeFailureCode()
    expect(code).toBe('PRG-W-QUOTA')
    expect(code).not.toContain('painel')
    expect(recorder.takeFailureCode()).toBeNull()
  })

  it('tenta de novo no tique seguinte: a posição acaba salva e a falha antiga some (sem aviso à toa)', async () => {
    failNextWrites(1)
    const recorder = createProgressRecorder(IDENTITY, true)

    recorder.onProgress(MIN_MS, DURATION_MS)
    await settle()
    recorder.onProgress(MIN_MS + 1000, DURATION_MS) // dentro do intervalo, mas a anterior falhou: regrava
    await settle()

    expect((await getUserState(IDENTITY.stableId))?.progressSeconds).toBe(RESUME_MIN_SECONDS + 1)
    expect(recorder.takeFailureCode()).toBeNull()
  })

  it('na saída ainda grava o que faltou (28 min) mesmo depois de uma falha antes', async () => {
    failNextWrites(1, 'AbortError')
    const recorder = createProgressRecorder(IDENTITY, true)
    const at28min = 28 * 60 * 1000

    recorder.onProgress(MIN_MS, DURATION_MS)
    await settle()
    recorder.onProgress(at28min, DURATION_MS)
    await recorder.onExit('close')
    await settle()

    expect((await getUserState(IDENTITY.stableId))?.progressSeconds).toBe(28 * 60)
    expect(recorder.takeFailureCode()).toBeNull()
  })

  it('conclusão que falha é avisada e é tentada de novo no tique seguinte (o filme acaba marcado como assistido)', async () => {
    failNextWrites(1)
    const recorder = createProgressRecorder(IDENTITY, true, undefined, { recordCompletion: true, completionRatio: 0.9 })

    recorder.onProgress(DURATION_MS * 0.95, DURATION_MS)
    await settle()
    expect(recorder.takeFailureCode()).toBe('PRG-W-QUOTA')
    expect((await getUserState(IDENTITY.stableId))?.completedAt).toBeUndefined()

    recorder.onProgress(DURATION_MS * 0.96, DURATION_MS)
    await settle()
    expect((await getUserState(IDENTITY.stableId))?.completedAt).toBeTypeOf('number')
  })

  it('só avisa a leitura DEPOIS da escrita terminar: o aviso de "gravado" chega com o estado já no banco', async () => {
    const recorder = createProgressRecorder(IDENTITY, true)
    const seenAtNotice: Array<number | undefined> = []
    const unsubscribe = subscribeProgressSettled(async () => {
      seenAtNotice.push((await getUserState(IDENTITY.stableId))?.progressSeconds)
    })

    recorder.onProgress(MIN_MS, DURATION_MS)
    await settle()
    recorder.onProgress(MIN_MS + 4000, DURATION_MS)
    settleExit(recorder, 'close')
    await settle()
    unsubscribe()

    expect(seenAtNotice).toHaveLength(1)
    expect(seenAtNotice[0]).toBeGreaterThanOrEqual(RESUME_MIN_SECONDS)
  })

  it('canal ao vivo nunca grava nem avisa', async () => {
    failNextWrites(5)
    const recorder = createProgressRecorder(IDENTITY, false)
    recorder.onProgress(MIN_MS * 10, undefined)
    await recorder.onExit('close')
    expect(recorder.takeFailureCode()).toBeNull()
    expect(await getUserState(IDENTITY.stableId)).toBeUndefined()
  })
})
