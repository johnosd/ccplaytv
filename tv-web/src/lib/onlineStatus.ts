import { useEffect, useState } from 'react'

/**
 * Estado real de conectividade (feature 022, D-012 do plan.md) — nunca um
 * valor estático recebido por prop (FR-029). Inicializa de
 * `navigator.onLine` e assina os eventos `online`/`offline` da janela.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
