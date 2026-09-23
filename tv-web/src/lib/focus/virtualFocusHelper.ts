export function handleVirtualDirection(
  direction: 'up' | 'down' | 'left' | 'right',
  currentIndex: number,
  totalItems: number,
  scrollToIndex: (idx: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void,
  setFocus: (focusKey: string) => void,
  prefix: string = 'item'
): boolean {
  if (direction !== 'down' && direction !== 'up') {
    return false // Not handled by 1D vertical list logic
  }

  let nextIndex = currentIndex
  
  if (direction === 'down') {
    nextIndex = currentIndex + 1
  } else if (direction === 'up') {
    nextIndex = currentIndex - 1
  }

  // Clamp - prevent wrap-around as per TV design guidelines
  if (nextIndex < 0) {
    nextIndex = 0
    return true // Prevent default propagation
  }
  if (nextIndex >= totalItems) {
    nextIndex = totalItems - 1
    return true // Prevent default propagation
  }

  // Scroll the virtualizer to make sure the element is mounted in the DOM
  scrollToIndex(nextIndex, { align: 'auto' })

  // Wait for the DOM to update (React render cycle + Norigin measure cycle)
  // Two rAF are often needed: one for React to flush the DOM, one for the browser to layout
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFocus(`${prefix}-${nextIndex}`)
      })
    })
  } else {
    // Fallback for test environments without rAF
    setTimeout(() => {
      setFocus(`${prefix}-${nextIndex}`)
    }, 16)
  }

  return true
}
