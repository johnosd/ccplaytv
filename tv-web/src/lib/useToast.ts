import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 1600

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((text: string) => {
    setMessage(text)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { toastMessage: message, showToast }
}
