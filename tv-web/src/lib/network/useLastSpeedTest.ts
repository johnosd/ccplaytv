import { useQuery } from '@tanstack/react-query'
import { readLastSpeedTestResult } from './speedTestRepository'

export const LAST_SPEED_TEST_QUERY_KEY = ['network', 'last-speed-test'] as const

/** Somente IndexedDB; consultar/focar nunca mede a conexão. */
export function useLastSpeedTest() {
  return useQuery({ queryKey: LAST_SPEED_TEST_QUERY_KEY, queryFn: () => readLastSpeedTestResult(), retry: false })
}
