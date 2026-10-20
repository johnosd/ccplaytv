/** Vínculo local da TV. DUID só transita no bootstrap; nunca autentica sozinho. */
import type { CatalogDb } from '../catalog/db'
import { DEVICE_KEY_PATTERN, DISPLAY_ID_PATTERN } from './displayId'
import { portalTables, type PortalDeviceRecord } from './portalTables'
import { withStorageRelief } from '../catalog/storageRelief'

export type CredentialIssuance = Pick<PortalDeviceRecord,
  'deviceId' | 'displayId' | 'bearer' | 'deviceKey' | 'authEpoch' | 'recoveryEpoch' |
  'recoveryCode' | 'recoveryCodeVersion'>

const opaqueId = /^[A-Za-z0-9_-]{1,128}$/
const secretToken = /^[A-Za-z0-9_-]{43}$/
const privateCode = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$/

export class DeviceIdentityError extends Error {
  constructor() { super('invalid_device_identity') }
}

export function readPlatformIdentity(getDuid: () => string): string {
  try {
    const identity = getDuid()
    if (typeof identity !== 'string' || !identity.trim() || identity.length > 512 || /[^\x20-\x7e]/.test(identity)) {
      throw new DeviceIdentityError()
    }
    return identity
  } catch { throw new DeviceIdentityError() }
}

function token256(cryptoApi: Crypto): string {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function validToken(token: string): boolean {
  if (!secretToken.test(token)) return false
  try {
    const raw = atob(token.replaceAll('-', '+').replaceAll('_', '/') + '=')
    return raw.length === 32 && btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') === token
  } catch { return false }
}

export async function enrollmentNonce(database: CatalogDb, cryptoApi: Crypto, now: number): Promise<string> {
  if (!Number.isFinite(now) || now < 0) throw new DeviceIdentityError()
  const candidate = token256(cryptoApi)
  const tables = portalTables(database)
  // Cadastro não pode falhar por catálogo cheio (bug armazenamento-app-cheio-na-tv-impede).
  return withStorageRelief(() => database.transaction('rw', tables.device, tables.bootstrap, async () => {
    if (await tables.device.get('device')) throw new DeviceIdentityError()
    const saved = await tables.bootstrap.get('bootstrap')
    if (saved?.enrollmentNonce) {
      if (!validToken(saved.enrollmentNonce)) throw new DeviceIdentityError()
      return saved.enrollmentNonce
    }
    await tables.bootstrap.put({ ...saved, id: 'bootstrap', createdAt: saved?.createdAt ?? now,
      enrollmentNonce: candidate })
    return candidate
  }), database)
}

function validateIssuance(value: CredentialIssuance) {
  if (!value || ['deviceId', 'bearer', 'deviceKey', 'recoveryEpoch', 'recoveryCode']
    .some(key => typeof value[key as keyof CredentialIssuance] !== 'string')) throw new DeviceIdentityError()
  if (!opaqueId.test(value.deviceId) || value.bearer.split('.').length !== 2 ||
      value.bearer.split('.')[0] !== value.deviceId || !validToken(value.bearer.split('.')[1] ?? '') ||
      // 070: chave de 10 dígitos; token legado (serviço anterior à 070) ainda é aceito e dispara o upgrade D-004.
      !(DEVICE_KEY_PATTERN.test(value.deviceKey) || validToken(value.deviceKey)) ||
      (value.displayId !== undefined && (typeof value.displayId !== 'string' || !DISPLAY_ID_PATTERN.test(value.displayId))) ||
      !validToken(value.recoveryEpoch) ||
      !Number.isSafeInteger(value.authEpoch) || value.authEpoch < 0 ||
      !Number.isSafeInteger(value.recoveryCodeVersion) || value.recoveryCodeVersion < 1 ||
      !privateCode.test(value.recoveryCode)) throw new DeviceIdentityError()
}

export async function persistCredentialIssuance(
  database: CatalogDb, value: CredentialIssuance, operationId: string, now: number,
): Promise<void> {
  validateIssuance(value)
  if (!opaqueId.test(operationId) || !Number.isFinite(now) || now < 0) throw new DeviceIdentityError()
  const tables = portalTables(database)
  // Credencial emitida pelo serviço tem de ficar gravada mesmo com o catálogo cheio (libera cache e repete).
  await withStorageRelief(() => database.transaction('rw', tables.device, tables.bootstrap, async () => {
    const previous = await tables.device.get('device')
    if (previous && (previous.deviceId !== value.deviceId || previous.authEpoch > value.authEpoch ||
        previous.recoveryCodeVersion > value.recoveryCodeVersion)) throw new DeviceIdentityError()
    if (previous && previous.authEpoch === value.authEpoch &&
        previous.recoveryEpoch === value.recoveryEpoch &&
        (previous.bearer !== value.bearer || previous.deviceKey !== value.deviceKey ||
         previous.recoveryCode !== value.recoveryCode)) throw new DeviceIdentityError()
    // Allowlist explícita: resposta remota não adiciona propriedades à persistência.
    await tables.device.put({ id: 'device', deviceId: value.deviceId,
      ...(value.displayId ? { displayId: value.displayId } : previous?.displayId ? { displayId: previous.displayId } : {}),
      bearer: value.bearer,
      deviceKey: value.deviceKey, authEpoch: value.authEpoch, recoveryEpoch: value.recoveryEpoch,
      recoveryCode: value.recoveryCode, recoveryCodeVersion: value.recoveryCodeVersion,
      nextSyncAt: previous?.nextSyncAt ?? now, lastSuccessfulSync: previous?.lastSuccessfulSync,
      syncRetry: previous?.syncRetry })
    const pendingBootstrap = await tables.bootstrap.get('bootstrap')
    const pendingPurpose = pendingBootstrap?.pendingRotation?.purpose ?? (pendingBootstrap?.pendingRecovery ? 'recovery' : undefined) ??
      (pendingBootstrap?.pendingAck?.operationId === operationId ? pendingBootstrap.pendingAck.purpose : undefined)
    await tables.bootstrap.put({ id: 'bootstrap', createdAt: now,
      pendingAck: { operationId, authEpoch: value.authEpoch, createdAt: now, ...(pendingPurpose ? { purpose: pendingPurpose } : {}) } })
  }), database)
}

/** Chamar somente após ACK remoto; resposta antiga não apaga emissão posterior. */
export async function acknowledgeCredentialIssuance(database: CatalogDb, operationId: string, authEpoch: number) {
  const tables = portalTables(database)
  return database.transaction('rw', tables.bootstrap, async () => {
    const saved = await tables.bootstrap.get('bootstrap')
    if (saved?.pendingAck?.operationId !== operationId || saved.pendingAck.authEpoch !== authEpoch) return false
    await tables.bootstrap.delete('bootstrap')
    return true
  })
}

/** Prova privada da emissão fica durável antes de revogar as credenciais atuais. */
export async function prepareCredentialRotation(
  database: CatalogDb, cryptoApi: Crypto, purpose: 'revoke' | 'rotate', now: number,
) {
  if (!Number.isFinite(now) || now < 0) throw new DeviceIdentityError()
  const operationId = token256(cryptoApi), claimSecret = token256(cryptoApi)
  const tables = portalTables(database)
  return database.transaction('rw', tables.device, tables.bootstrap, async () => {
    const device = await tables.device.get('device')
    if (!device) throw new DeviceIdentityError()
    const saved = await tables.bootstrap.get('bootstrap')
    if (saved?.pendingAck) throw new DeviceIdentityError()
    if (saved?.pendingRotation) {
      const pending = saved.pendingRotation
      if (pending.deviceId !== device.deviceId || pending.authEpoch !== device.authEpoch ||
          pending.purpose !== purpose || !validToken(pending.operationId) || !validToken(pending.claimSecret)) {
        throw new DeviceIdentityError()
      }
      return pending
    }
    const pendingRotation = { operationId, claimSecret, purpose, deviceId: device.deviceId,
      authEpoch: device.authEpoch, startedAt: now }
    await tables.bootstrap.put({ id: 'bootstrap', createdAt: now, pendingRotation })
    return pendingRotation
  })
}


/** Persistir antes de pedir um desafio: repetir a rede não troca a prova privada. */
export async function prepareRecoveryChallenge(database: CatalogDb, cryptoApi: Crypto, now: number) {
  if (!Number.isFinite(now) || now < 0) throw new DeviceIdentityError()
  const nonce = token256(cryptoApi)
  const tables = portalTables(database)
  return database.transaction('rw', tables.bootstrap, async () => {
    const saved = await tables.bootstrap.get('bootstrap')
    if (saved?.pendingAck) throw new DeviceIdentityError()
    if (saved?.recoveryRequest && now >= saved.recoveryRequest.startedAt &&
        now < saved.recoveryRequest.startedAt + 300_000) {
      if (!validToken(saved.recoveryRequest.nonce)) throw new DeviceIdentityError()
      return saved.recoveryRequest.nonce
    }
    await tables.bootstrap.put({ ...saved, id: 'bootstrap', createdAt: saved?.createdAt ?? now,
      recoveryRequest: { nonce, startedAt: now }, pendingRecovery: undefined })
    return nonce
  })
}

export interface RecoveryChallenge {
  claimId: string
  deviceId: string
  token: string
  claimSecret: string
  expiresAt: string
}

/** Só mostrar o QR depois deste commit. Não altera catálogo nem credenciais atuais. */
export async function persistRecoveryChallenge(
  database: CatalogDb, nonce: string, challenge: RecoveryChallenge, now: number,
) {
  if (!challenge || !validToken(nonce) || !Number.isFinite(now) || now < 0 ||
      typeof challenge.claimId !== 'string' || !/^claim-[A-Za-z0-9_-]{1,128}$/.test(challenge.claimId) ||
      typeof challenge.deviceId !== 'string' || !opaqueId.test(challenge.deviceId) ||
      typeof challenge.token !== 'string' || !validToken(challenge.token) ||
      typeof challenge.claimSecret !== 'string' || !validToken(challenge.claimSecret) ||
      typeof challenge.expiresAt !== 'string') throw new DeviceIdentityError()
  const expiresAt = Date.parse(challenge.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 300_000) {
    throw new DeviceIdentityError()
  }
  const tables = portalTables(database)
  return database.transaction('rw', tables.device, tables.bootstrap, async () => {
    const saved = await tables.bootstrap.get('bootstrap')
    const device = await tables.device.get('device')
    if (!saved?.recoveryRequest || saved.recoveryRequest.nonce !== nonce || saved.pendingAck ||
        now < saved.recoveryRequest.startedAt || now >= saved.recoveryRequest.startedAt + 300_000 ||
        (device && device.deviceId !== challenge.deviceId)) throw new DeviceIdentityError()
    const pendingRecovery = { claimId: challenge.claimId, deviceId: challenge.deviceId,
      token: challenge.token, claimSecret: challenge.claimSecret, expiresAt }
    if (saved.pendingRecovery && (saved.pendingRecovery.claimId !== challenge.claimId ||
        saved.pendingRecovery.token !== challenge.token || saved.pendingRecovery.claimSecret !== challenge.claimSecret ||
        saved.pendingRecovery.expiresAt !== expiresAt)) throw new DeviceIdentityError()
    await tables.bootstrap.put({ ...saved, pendingRecovery })
    return pendingRecovery
  })
}
