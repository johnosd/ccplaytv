/**
 * Atualização da lista ativa quando o app volta ao primeiro plano (bug
 * `lista-xtream-nao-atualiza-novos-filmes`). Na TV o app costuma ficar
 * residente: voltar a ele é um `visibilitychange`, não uma nova escolha de
 * lista — sem este gatilho, filmes, séries e canais que o provedor acrescentou
 * ou tirou nunca apareciam enquanto a pessoa não escolhesse a lista de novo.
 *
 * Quem decide se há o que importar continua sendo `decideOnOpen` (via
 * `useOpenSource`); aqui só se decide se vale perguntar.
 */

import { useEffect, useRef } from 'react'
import { REFRESH_ON_OPEN_MIN_MS } from '../../lib/catalog/freshness'
import { accessFromAccount } from '../../lib/catalog/sourceAccount'
import { isSourceSyncing } from './sourceSyncing'
import type { SourceOut } from './importApi'

export interface ForegroundCheckInput {
  source: SourceOut | null
  syncing: boolean
  /** Última verificação feita por este gatilho nesta sessão. */
  lastCheckAt: number | undefined
  now: number
}

/**
 * Sem lista ativa, com sincronização em andamento, com acesso bloqueado pela
 * conta guardada (vencida/recusada, feature 034 — a TV não reabre a tela de
 * acesso por conta própria) ou dentro do intervalo mínimo, não pergunta.
 */
export function shouldCheckOnForeground({ source, syncing, lastCheckAt, now }: ForegroundCheckInput): boolean {
  if (!source || syncing) return false
  if (accessFromAccount(source, now).action !== 'open') return false
  return lastCheckAt === undefined || now - lastCheckAt >= REFRESH_ON_OPEN_MIN_MS
}

/**
 * Liga o gatilho: a cada volta ao primeiro plano, `check(source.id)` quando
 * `shouldCheckOnForeground` deixa. O retrato da fonte e o callback mais novos
 * vêm por ref — o ouvinte é registrado uma vez só.
 */
export function useRefreshOnForeground(
  source: SourceOut | null,
  check: (sourceId: string) => void,
  now: () => number = Date.now,
): void {
  const latest = useRef({ source, check, now })
  const lastCheckAt = useRef<number | undefined>(undefined)

  useEffect(() => {
    latest.current = { source, check, now }
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const { source: current, check: run, now: clock } = latest.current
      const at = clock()
      const syncing = current !== null && isSourceSyncing(current.id)
      if (!shouldCheckOnForeground({ source: current, syncing, lastCheckAt: lastCheckAt.current, now: at })) return
      lastCheckAt.current = at
      run(current!.id)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
}
