/**
 * Ações focáveis de Portal & licença por **id**, nunca por índice (features 075/076): o conjunto muda com o build, a
 * licença, a falha de vínculo e a visão (principal ou Avançado), e o foco é reconciliado pelo id (constitution,
 * "Voltar Restaura Foco"). Detalhes e transições: `sdd/specs/076-simplificar-portal-licenca/logic/avancado-foco.md`.
 */
export type PortalView = 'main' | 'advanced'
export type MainActionId = 'retry' | 'purchase' | 'refresh' | 'advanced'
export type AdvancedActionId = 'eye' | 'rotate' | 'recover' | 'unlink'
export type PortalActionId = MainActionId | AdvancedActionId

/** Tela principal: `[retry?] → purchase* → refresh* → advanced` (`*` só no build comercial). */
export function mainActions(state: { pairingFailed: boolean; commercial: boolean }): MainActionId[] {
  return [
    ...(state.pairingFailed ? ['retry' as const] : []),
    ...(state.commercial ? ['purchase' as const, 'refresh' as const] : []),
    'advanced',
  ]
}

/** Subtela Avançado: sempre as quatro, nesta ordem; o foco entra em `eye`. */
export const ADVANCED_ACTIONS: AdvancedActionId[] = ['eye', 'rotate', 'recover', 'unlink']

/** Foco ao entrar no painel (FR-004): Comprar (teste/vencida/sem), Atualizar (ativa), Avançado (build não comercial). */
export function initialMain(actions: MainActionId[], state: { commercial: boolean; licenseState?: 'trial' | 'active' | 'revoked' }): MainActionId {
  const wanted: MainActionId = state.commercial ? (state.licenseState === 'active' ? 'refresh' : 'purchase') : 'advanced'
  return actions.includes(wanted) ? wanted : actions[0]
}

/**
 * O cartão Acessar o portal oferece o botão do vínculo (`retry`) quando o cadastro falhou ou a TV foi desvinculada
 * (sem ele, esses estados não teriam nenhum elemento focável no cartão — constitution, "Foco Visível").
 */
export function pairingNeedsAction(connected: boolean, pairing: { qrUrl?: string; device?: unknown; state: string }) {
  const failed = connected && !pairing.qrUrl && pairing.state === 'failed'
  const unlinked = connected && !pairing.device && pairing.state === 'ready'
  return { failed, unlinked, needed: failed || unlinked }
}

/** O foco guardado só vale enquanto a ação existe na visão atual; senão cai na inicial (a licença ou a falha mudou). */
export function resolveAction<T extends PortalActionId>(actions: T[], initial: T, focusedId?: PortalActionId): T {
  return focusedId && (actions as PortalActionId[]).includes(focusedId) ? focusedId as T : initial
}
