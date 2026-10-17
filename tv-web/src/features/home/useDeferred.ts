import { useEffect, useState } from 'react'

/**
 * `false` até `ms` depois da montagem, `true` daí em diante (feature 060, D-013): adia leituras que não decidem a primeira
 * tela (o resumo de séries em dia) para depois do primeiro desenho. Os "adicionados" saíram daqui na feature 079.
 */
export function useDeferred(ms: number): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return ready
}
