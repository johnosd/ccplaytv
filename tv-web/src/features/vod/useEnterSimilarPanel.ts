import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** Chaves focáveis do painel de Semelhantes (vazio enquanto carrega ou sem nada focável). */
  keys: string[]
  /** Foca o painel na chave dada (a tela decide a linha/estado de foco). */
  enter: (firstKey: string) => void
}

/**
 * A ação "Semelhantes" do hero (feature 035, pedido pós-TV): a aba ficava
 * abaixo da dobra e passava despercebida. OK na ação ativa a aba, rola até o
 * painel e leva o foco ao primeiro cartão assim que houver um — sem disparar
 * nenhuma consulta que a aba já não faria (FR-003/SC-005). Qualquer tecla de
 * direção cancela o pedido pendente, pra o foco nunca ser puxado depois de a
 * pessoa já ter ido a outro lugar.
 */
export function useEnterSimilarPanel({ keys, enter }: Options) {
  const [pending, setPending] = useState(false)
  const panelElement = useRef<HTMLDivElement | null>(null)
  // Ref de callback: a tela só repassa a função ao `ref=`, nunca lê `.current` no render.
  const panelRef = useCallback((element: HTMLDivElement | null) => {
    panelElement.current = element
  }, [])
  const enterRef = useRef(enter)
  useEffect(() => {
    enterRef.current = enter
  })

  useEffect(() => {
    if (!pending) return
    panelElement.current?.scrollIntoView?.({ block: 'nearest' })
  }, [pending])

  useEffect(() => {
    if (!pending || keys.length === 0) return
    enterRef.current(keys[0])
    setPending(false)
  }, [pending, keys])

  const request = useCallback(() => setPending(true), [])
  const cancel = useCallback(() => setPending(false), [])
  return { panelRef, request, cancel }
}
