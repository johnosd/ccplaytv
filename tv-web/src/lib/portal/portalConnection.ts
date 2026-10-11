/** Bootstrap/rotação explícitos; nenhum DUID/segredo sai em erro ou log. */
import type { CatalogDb } from '../catalog/db'
import { createPortalClient, PortalRequestError } from './portalClient'
import { acknowledgeCredentialIssuance, enrollmentNonce, persistCredentialIssuance,
  prepareCredentialRotation, prepareRecoveryChallenge, persistRecoveryChallenge, readPlatformIdentity, type CredentialIssuance, type RecoveryChallenge } from './deviceIdentity'
import { portalTables, type PortalDeviceRecord } from './portalTables'

export type ControlClient = ReturnType<typeof createPortalClient>
export interface PortalInvite { token: string; expiresAt: string; qrDataUrl: string }
export class PortalConnection {
  private running?: Promise<PortalDeviceRecord>
  readonly database: CatalogDb
  readonly client: ControlClient
  readonly origin: string
  private getDuid: () => string
  constructor(database: CatalogDb, client: ControlClient, origin: string, getDuid: () => string) {
    this.database = database
    this.client = client
    this.origin = origin
    this.getDuid = getDuid
  }

  ready(): Promise<PortalDeviceRecord> {
    if (!this.running) {
      const request = this.prepare()
      this.running = request
      void request.finally(() => { if (this.running === request) this.running = undefined }).catch(() => {})
    }
    return this.running
  }
  private async prepare(): Promise<PortalDeviceRecord> {
    const tables = portalTables(this.database)
    let device = await tables.device.get('device')
    const bootstrap = await tables.bootstrap.get('bootstrap')
    if (bootstrap?.pendingRotation) {
      if (!device) throw new PortalRequestError('unauthorized')
      const pending = bootstrap.pendingRotation
      try {
        await this.client.request(pending.purpose === 'revoke' ? '/portal/v1/device/revoke' : '/portal/v1/device/recovery-code/rotate',
          { bearer: device.bearer, body: { operationId: pending.operationId, claimSecret: pending.claimSecret, confirmed: true } })
      } catch (error) {
        if (!(error instanceof PortalRequestError) || error.code !== 'unauthorized') throw error
        // Resposta perdida após rotação: somente a prova privada pode obter o resultado.
      }
      const result = await this.client.request<{ operationId: string; state: string; credentials?: CredentialIssuance }>(
        '/portal/v1/devices/recovery/result', { bearer: pending.claimSecret,
          body: { deviceId: pending.deviceId, operationId: pending.operationId } })
      if (result.operationId !== pending.operationId || result.state !== 'ready' || !result.credentials) throw new PortalRequestError('service_unavailable')
      await persistCredentialIssuance(this.database, result.credentials, result.operationId, Date.now())
      device = await tables.device.get('device')
    }
    if (!device) {
      const nonce = await enrollmentNonce(this.database, crypto, Date.now())
      const platformIdentity = readPlatformIdentity(this.getDuid)
      const issued = await this.client.request<CredentialIssuance & { operationId: string }>('/portal/v1/devices/enroll',
        { body: { platformIdentity, nonce } })
      await persistCredentialIssuance(this.database, issued, issued.operationId, Date.now())
      device = await tables.device.get('device')
    }
    if (!device) throw new PortalRequestError('service_unavailable')
    const pending = (await tables.bootstrap.get('bootstrap'))?.pendingAck
    if (pending) {
      await this.client.request('/portal/v1/devices/recovery/ack',
        { bearer: device.bearer, body: { operationId: pending.operationId } })
      await acknowledgeCredentialIssuance(this.database, pending.operationId, pending.authEpoch)
    }
    return device
  }
  async invite(): Promise<{ deviceId: string; invite: PortalInvite }> {
    const device = await this.ready()
    const invite = await this.client.request<PortalInvite>('/portal/v1/device/invites',
      { bearer: device.bearer, body: { purpose: 'manage' } })
    const expiry = Date.parse(invite.expiresAt)
    if (!/^[A-Za-z0-9_-]{43}$/.test(invite.token) || !Number.isFinite(expiry) || expiry <= Date.now() ||
        expiry > Date.now() + 300000 || typeof invite.qrDataUrl !== 'string' || invite.qrDataUrl.length > 65536 ||
        (!invite.qrDataUrl.startsWith('data:image/png;base64,') || !/^[A-Za-z0-9+/=]+$/.test(invite.qrDataUrl.slice(22)))) throw new PortalRequestError('service_unavailable')
    return { deviceId: device.deviceId, invite }
  }
  async recovery(): Promise<{ deviceId: string; invite: PortalInvite }> {
    const nonce = await prepareRecoveryChallenge(this.database, crypto, Date.now())
    const challenge = await this.client.request<RecoveryChallenge & { qrDataUrl: string }>('/portal/v1/devices/recovery/challenges',
      { body: { platformIdentity: readPlatformIdentity(this.getDuid), nonce } })
    await persistRecoveryChallenge(this.database, nonce, challenge, Date.now())
    if (typeof challenge.qrDataUrl !== 'string' || challenge.qrDataUrl.length > 65536 ||
        !challenge.qrDataUrl.startsWith('data:image/png;base64,') || !/^[A-Za-z0-9+/=]+$/.test(challenge.qrDataUrl.slice(22))) {
      throw new PortalRequestError('service_unavailable')
    }
    return { deviceId: challenge.deviceId, invite: { token: challenge.token,
      expiresAt: challenge.expiresAt, qrDataUrl: challenge.qrDataUrl } }
  }
  async pollRecovery(signal: AbortSignal): Promise<'waiting' | 'ready' | 'expired'> {
    const bootstrap = await portalTables(this.database).bootstrap.get('bootstrap')
    if (bootstrap?.pendingAck?.purpose === 'recovery') { signal.throwIfAborted(); await this.ready(); return 'ready' }
    const pending = bootstrap?.pendingRecovery
    if (!pending) return 'expired'
    let result: { operationId: string; state: string; credentials?: CredentialIssuance }
    try {
      result = await this.client.request('/portal/v1/devices/recovery/result', { bearer: pending.claimSecret,
        body: { claimId: pending.claimId }, signal })
    } catch (error) {
      if (error instanceof PortalRequestError && error.code === 'unauthorized' && Date.now() >= pending.expiresAt) return 'expired'
      throw error
    }
    if (result.state === 'awaiting_confirmation') return Date.now() >= pending.expiresAt ? 'expired' : 'waiting'
    if (result.state !== 'ready' || !result.credentials || result.credentials.deviceId !== pending.deviceId) {
      if (result.state === 'pending') return 'waiting'
      throw new PortalRequestError('service_unavailable')
    }
    signal.throwIfAborted()
    await persistCredentialIssuance(this.database, result.credentials, result.operationId, Date.now())
    await this.ready()
    return 'ready'
  }
  async rotate(purpose: 'revoke' | 'rotate') {
    const pending = await portalTables(this.database).bootstrap.get('bootstrap')
    if (pending?.pendingRotation || pending?.pendingAck?.purpose === purpose) return this.ready()
    await this.ready()
    await prepareCredentialRotation(this.database, crypto, purpose, Date.now())
    return this.ready()
  }
}
