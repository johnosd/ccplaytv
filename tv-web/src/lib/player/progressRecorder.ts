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
   * comportamento da 011 (`clearProgress`) — só `kind:'episode'` liga isto;
   * "assistido" de filme é o item 13 do backlog, não esta feature.
   */
  recordCompletion?: boolean
}

export interface ProgressRecorder {
  /** Chamado a cada atualização de posição do motor (`session.onProgress`). */
  onProgress(positionMs: number, durationMs: number | undefined): void
  /** Chamado ao sair: pausa, RETURN/fechar a camada, ou conclusão real. */
  onExit(reason: ExitReason): void
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

  function write(positionMs: number): void {
    if (!identity) return
    lastWrittenMs = positionMs
    void updateProgress(identity.stableId, identity.sourceId, Math.floor(positionMs / 1000), database)
  }

  function clear(): void {
    if (!identity) return
    if (options.recordCompletion) {
      void markCompleted(identity.stableId, identity.sourceId, database)
      return
    }
    void clearProgress(identity.stableId, identity.sourceId, database)
  }

  /** `aoAtualizarPosição` do design — usada tanto por `onProgress` quanto por `onExit`. */
  function apply(positionMs: number, durationMs: number | undefined): void {
    if (!reportsPosition) return // canal ao vivo: nunca grava progresso
    if (!identity) return

    if (isPastEnd(positionMs, durationMs)) {
      clear()
      clearedThisSession = true
      return
    }
    if (clearedThisSession) return
    if (positionMs < RESUME_MIN_SECONDS * 1000) return // FR-014, limiar inicial
    if (lastWrittenMs === null || shouldWriteProgress(positionMs, lastWrittenMs)) {
      write(positionMs)
    }
  }

  return {
    onProgress(positionMs, durationMs) {
      if (done) return
      hasAdvanced = true
      lastKnownMs = positionMs
      lastKnownDurationMs = durationMs
      apply(positionMs, durationMs)
    },
    onExit(reason) {
      if (done) return
      if (reason === 'completed') {
        // FR-020: conclusão sempre limpa, mesmo sem ter havido avanço gravável.
        clear()
        done = true
        return
      }
      if (!hasAdvanced) return // FR-017: falha antes de qualquer avanço não grava nada
      if (lastKnownMs === null) return
      apply(lastKnownMs, lastKnownDurationMs)
    },
  }
}
