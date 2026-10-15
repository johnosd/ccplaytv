import { useEffect, useState } from 'react'

/**
 * `false` até `ms` depois da montagem, `true` daí em diante (feature 060, D-013): adia as leituras caras (o índice de busca
 * inteiro de "adicionados", o resumo de séries em dia) para depois do primeiro desenho, sem bloquear o foco inicial.
 */
export function useDeferred(ms: number): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return ready
}
