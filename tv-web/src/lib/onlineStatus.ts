import { useNetworkState } from './network/networkState'

/**
 * Estado real de conectividade (feature 022, D-012 do plan.md) — nunca um
 * valor estático recebido por prop (FR-029). Desde a feature 042 lê do mesmo
 * redutor que o resto do app (`lib/network/networkState.ts`): uma fonte só.
 */
export function useOnlineStatus(): boolean {
  return useNetworkState().online
}
