import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listSubtitleKeyStatus,
  removeSubtitleKey,
  setSubtitleKeyChosen,
  testSubtitleKey,
  type SubtitleKeyStatus,
} from '../../lib/subtitles/subtitleCredentials'
import type { SubtitleProvider } from '../../lib/subtitles/types'
import { db } from '../../lib/catalog/db'
import { clearSubtitleKeyFeedback, readSubtitleKeyFeedback, type SubtitleKeyFeedback } from '../../lib/portal/subtitleKeyFeedback'

export interface SubtitleKeys {
  /** Uma linha por fornecedor; vazio enquanto a leitura local não voltou (a seção mostra "sem chave"). */
  statuses: SubtitleKeyStatus[]
  feedback: SubtitleKeyFeedback
  /** Fornecedor com "Testar" em andamento. */
  testing: SubtitleProvider | null
  refresh(corrected?: SubtitleProvider): void
  test(provider: SubtitleProvider): Promise<SubtitleKeyStatus>
  remove(provider: SubtitleProvider): Promise<void>
  useMine(provider: SubtitleProvider): Promise<void>
}

/**
 * Estado da seção "Legendas" da aba Integrações (feature 090, US3). Lê o IndexedDB só ao abrir a aba (D-012) e depois de
 * cada mudança; guarda só a versão MASCARADA — a chave crua não passa por aqui.
 */
export function useSubtitleKeys(): SubtitleKeys {
  const [statuses, setStatuses] = useState<SubtitleKeyStatus[]>([])
  const [feedback, setFeedback] = useState<SubtitleKeyFeedback>({})
  const [testing, setTesting] = useState<SubtitleProvider | null>(null)
  const mounted = useRef(true)

  const refresh = useCallback((corrected?: SubtitleProvider) => {
    if (corrected) clearSubtitleKeyFeedback(db, corrected)
    listSubtitleKeyStatus().then(
      (rows) => {
        if (mounted.current) { setStatuses(rows); setFeedback(readSubtitleKeyFeedback(db)) }
      },
      () => {},
    )
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    return () => {
      mounted.current = false
    }
  }, [refresh])

  return {
    statuses,
    feedback,
    testing,
    refresh,
    async test(provider) {
      clearSubtitleKeyFeedback(db, provider)
      setTesting(provider)
      try {
        return await testSubtitleKey(provider)
      } finally {
        if (mounted.current) setTesting(null)
        refresh()
      }
    },
    async remove(provider) {
      await removeSubtitleKey(provider)
      clearSubtitleKeyFeedback(db, provider)
      refresh()
    },
    async useMine(provider) {
      await setSubtitleKeyChosen(provider, true)
      clearSubtitleKeyFeedback(db, provider)
      refresh()
    },
  }
}
