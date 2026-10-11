export interface VerifiedEntitlement {
  deviceId: string
  startsAt: number
  expiresAt: number
  state: 'trial' | 'active' | 'revoked'
}

export interface PlaybackAccessInput {
  deviceId: string
  entitlement?: VerifiedEntitlement
  verification: 'valid' | 'invalid' | 'missing'
  trustedNow: number
  serviceOnline: boolean
}

export interface PlaybackAccessDecision {
  allowed: boolean
  reason: 'valid' | 'expired' | 'revoked' | 'not_activated' | 'invalid'
}

/** Recebe somente o resultado do verificador criptográfico; nunca um JSON sem verificar. */
export function evaluatePlaybackAccess(input: PlaybackAccessInput): PlaybackAccessDecision {
  if (input.verification === 'invalid') return { allowed: false, reason: 'invalid' }
  if (input.verification === 'missing' || !input.entitlement) return { allowed: false, reason: 'not_activated' }
  const entitlement = input.entitlement
  if (input.verification !== 'valid' || !input.deviceId || entitlement.deviceId !== input.deviceId ||
      !Number.isFinite(input.trustedNow) || input.trustedNow < 0 ||
      !Number.isFinite(entitlement.startsAt) || !Number.isFinite(entitlement.expiresAt) ||
      entitlement.startsAt < 0 || entitlement.expiresAt <= entitlement.startsAt ||
      !['trial', 'active', 'revoked'].includes(entitlement.state)) return { allowed: false, reason: 'invalid' }
  if (entitlement.state === 'revoked') return { allowed: false, reason: 'revoked' }
  if (input.trustedNow >= entitlement.expiresAt) return { allowed: false, reason: 'expired' }
  if (input.trustedNow < entitlement.startsAt) return { allowed: false, reason: 'not_activated' }
  return { allowed: true, reason: 'valid' }
}
