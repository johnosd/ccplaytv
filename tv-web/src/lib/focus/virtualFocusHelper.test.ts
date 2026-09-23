import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleVirtualDirection } from './virtualFocusHelper'

describe('virtualFocusHelper', () => {
  let scrollToIndex: any
  let setFocus: any

  beforeEach(() => {
    scrollToIndex = vi.fn()
    setFocus = vi.fn()
    vi.useFakeTimers()
  })

  it('should ignore left/right', () => {
    const handled = handleVirtualDirection('right', 0, 10, scrollToIndex, setFocus)
    expect(handled).toBe(false)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('should calculate next down index and request scroll', () => {
    const handled = handleVirtualDirection('down', 5, 10, scrollToIndex, setFocus, 'channel')
    expect(handled).toBe(true)
    expect(scrollToIndex).toHaveBeenCalledWith(6, { align: 'auto' })
    
    vi.runAllTimers()
    expect(setFocus).toHaveBeenCalledWith('channel-6')
  })

  it('should calculate next up index and request scroll', () => {
    const handled = handleVirtualDirection('up', 5, 10, scrollToIndex, setFocus, 'channel')
    expect(handled).toBe(true)
    expect(scrollToIndex).toHaveBeenCalledWith(4, { align: 'auto' })
    
    vi.runAllTimers()
    expect(setFocus).toHaveBeenCalledWith('channel-4')
  })

  it('should clamp at top without scrolling', () => {
    const handled = handleVirtualDirection('up', 0, 10, scrollToIndex, setFocus)
    expect(handled).toBe(true) // handled to prevent default wrap-around
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('should clamp at bottom without scrolling', () => {
    const handled = handleVirtualDirection('down', 9, 10, scrollToIndex, setFocus)
    expect(handled).toBe(true)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })
})

