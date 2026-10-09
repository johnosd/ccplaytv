import { useEffect, useState } from 'react'
import { prepareLocalStartup } from './startupReadiness'

/** Fontes locais e estado de fontes consultado; idioma/movimento são síncronos. */
export function useStartupReadiness(sourcesReady: boolean): boolean {
  const [localReady, setLocalReady] = useState(false)
  useEffect(() => {
    let active = true
    void prepareLocalStartup().then(() => {
      if (active) setLocalReady(true)
    })
    return () => {
      active = false
    }
  }, [])
  return localReady && sourcesReady
}
