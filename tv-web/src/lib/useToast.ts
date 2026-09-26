import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 1600

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  // Incrementa a CADA `showToast`, inclusive com o mesmo texto de antes —
  // é o que faz `Toast` remontar o nó dentro da região de anúncio e o
  // leitor de tela anunciar de novo uma repetição (feature 021, D-004).
  const [toastKey, setToastKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((text: string) => {
    setMessage(text)
    setToastKey((key) => key + 1)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { toastMessage: message, toastKey, showToast }
}
