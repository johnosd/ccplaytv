/**
 * Máquina de gravação de progresso (feature 011, `logic/reproducao-vod.md`
 * §2). Sem React: recebe posição/duração e decide gravar, apagar ou nada —
 * testável sem DOM, consumida pela camada de reprodução (`PlayerLayer.tsx`).
 */

import { db, type CatalogDb } from '../catalog/db'
import { clearProgress, markCompleted, updateProgress } from '../catalog/userStateRepository'
import { RESUME_MIN_SECONDS, isPastEnd, shouldWriteProgress } from './resumePolicy'

/** Identidade do item cuja posição está sendo gravada. */
export interface ProgressRecorderIdentity {
  stableId: string
  sourceId: string
}

/** Por que a reprodução está saindo — decide o tratamento de FR-017/FR-020. */
export type ExitReason = 'pause' | 'close' | 'completed'

export interface ProgressRecorderOptions {
  /**
   * Feature 012, D-007: os dois pontos que hoje apagam a retomada (cruzar
   * o limiar final, e conclusão real do motor) gravam conclusão
   * (`markCompleted`) em vez de só limpar. `false`/ausente preserva o
   * comportamento da 011 (`clearProgress`). Desde a feature 019, `PlayerLayer`
   * liga isto também para `kind: 'movie'` (não só `'episode'`).
   */
  recordCompletion?: boolean
  /**
   * Feature 019, D-002/D-003: o limiar (fração da duração) que `isPastEnd`
   * usa para decidir "cruzou o fim". `undefined` preserva o default de
   * `isPastEnd` (`RESUME_MAX_RATIO`, 95% — comportamento de episódio,
   * intocado). `PlayerLayer` passa `MOVIE_WATCHED_RATIO` (90%) para filme.
   */
  completionRatio?: number
}

export interface ProgressRecorder {
  /** Chamado a cada atualização de posição do motor (`session.onProgress`). */
  onProgress(positionMs: number, durationMs: number | undefined): void
  /**
   * Chamado ao sair: pausa, RETURN/fechar a camada, ou conclusão real.
   *
   * Devolve uma Promise que resolve só depois da escrita (ou não-escrita)
   * ter terminado — achado real na feature 019, T023: `PlayerLayer.tsx`
   * fechava a camada (disparando `invalidateUserState`) *antes* da
   * transação de `markCompleted` comitar, e como a leitura invalidada é
   * mais simples (1 operação) que a escrita (get+put dentro de uma
   * transação), o refetch às vezes vencia a corrida e ficava preso
   * mostrando o estado antigo até a tela remontar. Chamadores que não
   * precisam esperar (`onExit('pause')`/`('close')` no cleanup) continuam
   * livres para ignorar o retorno — só o caminho de conclusão automática
   * (`onCompleted`/`onClose` chamado em seguida) precisa de `await`.
   */
  onExit(reason: ExitReason): Promise<void>
}

/**
 * `identity: null` é o caso D-010/R-010: `buildStableId` lançou porque o
 * item não tem `providerStreamId` nem `originalName`. O gravador inteiro vira
 * no-op — a reprodução continua normalmente, só não sobra progresso pra
 * retomar. A exceção nunca chega aqui: é contida por quem monta a identidade
 * (`PlayerLayer.tsx`), antes de criar o gravador.
 */
export function createProgressRecorder(
  identity: ProgressRecorderIdentity | null,
  reportsPosition: boolean,
  database: CatalogDb = db,
  options: ProgressRecorderOptions = {},
): ProgressRecorder {
  let lastWrittenMs: number | null = null
  let lastKnownMs: number | null = null
  let lastKnownDurationMs: number | undefined
  // Uma vez apagado por ultrapassar o limiar final, a sessão não regrava —
  // senão o filme voltaria a ser "retomável" no ponto 96% (logic §2).
  let clearedThisSession = false
  let hasAdvanced = false
  // Selado após a conclusão real (US3): a desmontagem da camada que se segue
  // a `onClose()` roda o cleanup do efeito, que chama `onExit('close')` de
  // novo — sem este selo, essa segunda chamada reaplicaria `apply()` sobre a
  // última posição conhecida e poderia regravar progresso num registro que
  // acabou de ser apagado como concluído.
  let done = false

  function write(positionMs: number): Promise<void> {
    if (!identity) return Promise.resolve()
    lastWrittenMs = positionMs
    return updateProgress(identity.stableId, identity.sourceId, Math.floor(positionMs / 1000), database)
  }

  function clear(): Promise<void> {
    if (!identity) return Promise.resolve()
    if (options.recordCompletion) {
      return markCompleted(identity.stableId, identity.sourceId, database)
    }
    return clearProgress(identity.stableId, identity.sourceId, database)
  }

  /** `aoAtualizarPosição` do design — usada tanto por `onProgress` quanto por `onExit`. */
  function apply(positionMs: number, durationMs: number | undefined): Promise<void> {
    if (!reportsPosition) return Promise.resolve() // canal ao vivo: nunca grava progresso
    if (!identity) return Promise.resolve()

    if (isPastEnd(positionMs, durationMs, options.completionRatio)) {
      clearedThisSession = true
      return clear()
    }
    if (clearedThisSession) return Promise.resolve()
    if (positionMs < RESUME_MIN_SECONDS * 1000) return Promise.resolve() // FR-014, limiar inicial
    if (lastWrittenMs === null || shouldWriteProgress(positionMs, lastWrittenMs)) {
      return write(positionMs)
    }
    return Promise.resolve()
  }

  return {
    onProgress(positionMs, durationMs) {
      if (done) return
      hasAdvanced = true
      lastKnownMs = positionMs
      lastKnownDurationMs = durationMs
      void apply(positionMs, durationMs)
    },
    async onExit(reason) {
      if (done) return
      if (reason === 'completed') {
        // FR-020: conclusão sempre limpa, mesmo sem ter havido avanço gravável.
        await clear()
        done = true
        return
      }
      if (!hasAdvanced) return // FR-017: falha antes de qualquer avanço não grava nada
      if (lastKnownMs === null) return
      await apply(lastKnownMs, lastKnownDurationMs)
    },
  }
}
