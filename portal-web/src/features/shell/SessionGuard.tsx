import { useEffect } from 'react'
import { useTvDataContext } from './TvDataProvider'

/**
 * Sessão encerrada no meio do uso (cookie vencido ou chave da TV trocada): a leitura compartilhada passa a receber
 * `access` (401/403). Em vez de deixar a pessoa numa casca só com alertas, avisa o `App`, que volta à entrada com o ID
 * lembrado e uma mensagem clara (feature 077, edge case "sessão expirada ou chave trocada na TV").
 */
export function SessionGuard({ onEnded }: { onEnded: () => void }) {
  const { dashboardError, deviceError } = useTvDataContext()
  const ended = dashboardError?.code === 'access' || deviceError?.code === 'access'
  useEffect(() => { if (ended) onEnded() }, [ended, onEnded])
  return null
}
