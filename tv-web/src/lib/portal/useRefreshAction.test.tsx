import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { refreshPortal } from './portalRuntime'
import { REFRESH_PAUSE_MS, useRefreshAction } from './useRefreshAction'

vi.mock('./portalRuntime', () => ({ refreshPortal: vi.fn() }))
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

// Feature 071, FR-003/FR-004: um aperto = uma consulta; repetir na pausa só explica; offline e erro ficam visíveis.
it('pausa de 10 s: o segundo aperto não consulta; offline e erro com código aparecem depois da pausa', async () => {
  let version = 'v1'
  const fingerprint = vi.fn(async () => version)
  const sourceIds = async () => [] as string[]
  vi.mocked(refreshPortal).mockImplementationOnce(async () => { version = 'v2'; return { ok: true } })
  const { result } = renderHook(() => useRefreshAction('lists', { fingerprint, sourceIds }))

  await act(async () => { await result.current.run() })
  expect(result.current.status).toBe('done')
  expect(result.current.paused).toBe(true)

  await act(async () => { await result.current.run() })
  expect(result.current.status).toBe('wait')
  expect(refreshPortal).toHaveBeenCalledTimes(1)

  act(() => { vi.advanceTimersByTime(REFRESH_PAUSE_MS) })
  expect(result.current.paused).toBe(false)

  vi.mocked(refreshPortal).mockResolvedValueOnce({ ok: false, code: 'offline' })
  await act(async () => { await result.current.run() })
  expect(result.current.status).toBe('offline')

  act(() => { vi.advanceTimersByTime(REFRESH_PAUSE_MS) })
  vi.mocked(refreshPortal).mockResolvedValueOnce({ ok: false, code: 'rate_limited' })
  await act(async () => { await result.current.run() })
  expect(result.current.status).toBe('failed')
  expect(result.current.code).toBe('rate_limited')

  act(() => { vi.advanceTimersByTime(REFRESH_PAUSE_MS) })
  vi.mocked(refreshPortal).mockResolvedValueOnce({ ok: true })
  await act(async () => { await result.current.run() })
  expect(result.current.status).toBe('nothing')
})
