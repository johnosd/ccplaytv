import { useEffect, useState } from 'react'

/**
 * O instante atual, renovado a cada `intervalMs` (feature 030, FR-028): é o
 * que faz a barra de progresso avançar e o programa trocar enquanto a tela
 * está aberta, sem a pessoa sair e voltar. 30 s deixa o atraso máximo bem
 * abaixo de 1 min.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
