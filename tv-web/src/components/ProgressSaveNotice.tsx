import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeProgressSettled } from '../lib/player/progressSettled'
import { useT } from '../lib/i18n/I18nProvider'
import { Toast } from './Toast'

/** Tempo na tela: a pessoa precisa conseguir ler e anotar o código (bem acima dos 1,6 s do toast comum). */
const NOTICE_MS = 9000

/**
 * Raiz do app: depois que a gravação de progresso de uma reprodução termina (bug
 * `filmes-no-salvam-progresso-reproduo-nem`) (1) invalida as leituras do estado do usuário — a camada de reprodução fecha
 * antes de a escrita comitar, e o detalhe lia o estado velho — e (2) se a escrita falhou, mostra um aviso curto com o
 * código (`PRG-W-…`: nunca mensagem, URL ou dado do banco). Fica na raiz porque filme e série compartilham o player e as
 * duas telas estão no teto de linhas da catraca. Chaves de consulta repetidas de `features/catalog/catalogApi.ts`
 * (`invalidateUserState`/`invalidateUserStates`) — `components/` não importa de `features/`.
 */
export function ProgressSaveNotice(): ReactNode {
  const t = useT()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<{ code: string; key: number } | null>(null)

  useEffect(
    () =>
      subscribeProgressSettled((failureCode) => {
        for (const key of ['user-state', 'user-states', 'history-content', 'series-watched-summary']) {
          void queryClient.invalidateQueries({ queryKey: [key] })
        }
        if (failureCode) setNotice((current) => ({ code: failureCode, key: (current?.key ?? 0) + 1 }))
      }),
    [queryClient],
  )

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  return <Toast message={notice ? t('player.progressSaveFailed', { code: notice.code }) : null} messageKey={notice?.key ?? 0} />
}
