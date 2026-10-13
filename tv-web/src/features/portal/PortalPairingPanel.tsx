import { liveQuery } from 'dexie'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'
import { PortalRequestError } from '../../lib/portal/portalClient'
import type { PortalConnection, PortalInvite } from '../../lib/portal/portalConnection'
import { acquirePortalQuick, portalSyncNow } from '../../lib/portal/portalRuntime'
import { portalTables, type PortalDeviceRecord } from '../../lib/portal/portalTables'
import './portalPairing.css'

export interface PortalPairingPanelProps {
  /** Conexão do portal; ausente = app sem portal configurado (estado honesto, sem dado inventado). */
  connection?: PortalConnection
  /** Voltar: sai da tela Adicionar (RETURN equivalente). */
  onBack: () => void
  /** Recarregar concluído (lista nova aplicada) — o chamador decide para onde ir. */
  onReloaded?: () => void
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'reloaded' } | { kind: 'failed'; code: string }

function codeOf(error: unknown): string {
  return error instanceof PortalRequestError ? error.code : error instanceof Error ? error.name : 'unexpected_error'
}

/** Endereço exibido: o site do painel; em `dev:portal` o site roda separado da origem proxied da API. */
function siteOf(connection: PortalConnection): string {
  const site = import.meta.env.VITE_PORTAL_SITE_URL as string | undefined
  try { return new URL(site || connection.origin).origin } catch { return new URL(connection.origin).origin }
}

/**
 * Coluna "Pelo celular" da tela Adicionar (feature 070, US1): ID do dispositivo, chave do dispositivo,
 * endereço do painel e QR visíveis sem ação extra, com Recarregar, Gerar nova chave e Voltar.
 * A chave aparece SOMENTE aqui (constitution 1.10.0, exceção (a)); o QR é convite efêmero e nunca a contém.
 * Abrir a tela é a ação explícita que consulta o portal; foco nunca dispara rede.
 */
export function PortalPairingPanel({ connection, onBack, onReloaded }: PortalPairingPanelProps): ReactNode {
  const t = useT()
  const [device, setDevice] = useState<PortalDeviceRecord>()
  const [invite, setInvite] = useState<PortalInvite>()
  const [status, setStatus] = useState<Status>({ kind: 'busy' })
  const [confirming, setConfirming] = useState(false)
  const [confirmFocus, setConfirmFocus] = useState<0 | 1>(0)
  const generation = useRef(0)

  // Tela rápida: enquanto aberta, a TV consulta o portal a cada ~10 s (listas aparecem sem Recarregar).
  useEffect(() => (connection ? acquirePortalQuick() : undefined), [connection])

  useEffect(() => {
    if (!connection) return
    const subscription = liveQuery(() => portalTables(connection.database).device.get('device'))
      .subscribe({ next: setDevice, error: () => setStatus({ kind: 'failed', code: 'local_storage_error' }) })
    return () => subscription.unsubscribe()
  }, [connection])

  // Upgrade D-004 + convite; renova o QR só enquanto montado.
  useEffect(() => {
    if (!connection) return
    const current = ++generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        await connection.ensurePairing()
        const { invite: next } = await connection.invite()
        if (current !== generation.current) return
        setInvite(next)
        setStatus(previous => (previous.kind === 'busy' ? { kind: 'idle' } : previous))
        timer = setTimeout(load, Math.max(1_000, Date.parse(next.expiresAt) - Date.now()))
      } catch (error) {
        if (current === generation.current) setStatus({ kind: 'failed', code: codeOf(error) })
      }
    }
    void load()
    return () => { generation.current++; if (timer) clearTimeout(timer) }
  }, [connection])

  async function reload() {
    setStatus({ kind: 'busy' })
    const result = await portalSyncNow()
    if (result.ok) { setStatus({ kind: 'reloaded' }); onReloaded?.() } else setStatus({ kind: 'failed', code: result.code ?? 'sync_error' })
  }

  async function renewKey() {
    if (!connection) return
    setConfirming(false)
    setStatus({ kind: 'busy' })
    try {
      await connection.rotate('revoke')
      const { invite: next } = await connection.invite()
      setInvite(next)
      setStatus({ kind: 'idle' })
    } catch (error) { setStatus({ kind: 'failed', code: codeOf(error) }) }
  }

  if (!connection) {
    return <section className="portal-pairing" aria-labelledby="pairing-title">
      <h3 id="pairing-title" className="source-setup-panel-title">{t('portal.pairing.title')}</h3>
      <p className="portal-pairing-text" role="status">{t('portal.unconfigured')}</p>
      <div className="portal-pairing-actions"><Button variant="secondary" onSelect={onBack}>{t('common.back')}</Button></div>
    </section>
  }

  return <section className="portal-pairing" aria-labelledby="pairing-title">
    <h3 id="pairing-title" className="source-setup-panel-title">{t('portal.pairing.title')}</h3>
    {/* QR em destaque, à esquerda; site, ID e chave como alternativa ao lado (o QR nunca contém a chave). */}
    <div className="portal-pairing-hero">
      <div className="portal-pairing-qr">
        <div className="portal-pairing-qr-frame">
          {invite ? <img src={invite.qrDataUrl} alt={t('portal.qrAlt')} />
            : <p className="portal-pairing-text" role={status.kind === 'busy' ? 'status' : undefined}>{status.kind === 'busy' ? t('portal.pairing.loading') : '—'}</p>}
        </div>
        <p className="portal-pairing-qr-caption">{t('portal.pairing.qr')}</p>
      </div>
      <div className="portal-pairing-info">
        <p className="portal-pairing-text">{t('portal.pairing.useIdKey')}</p>
        <p className="portal-pairing-text">{t('portal.pairing.site')} <b className="portal-pairing-url">{siteOf(connection)}</b></p>
        <dl className="portal-pairing-credentials">
          <div><dt>{t('portal.pairing.deviceId')}</dt><dd><span className="portal-pairing-value">{device?.displayId ?? '—'}</span></dd></div>
          <div><dt>{t('portal.pairing.deviceKey')}</dt><dd><span className="portal-pairing-value">{device?.displayId ? device.deviceKey : '—'}</span></dd></div>
        </dl>
      </div>
    </div>
    <p className="portal-pairing-text portal-pairing-hint">{t('portal.pairing.afterAdd')}</p>
    {status.kind === 'reloaded' && <p className="portal-pairing-text" role="status">{t('portal.pairing.reloaded')}</p>}
    {status.kind === 'failed' && <>
      <p className="portal-pairing-text" role="alert">{t('portal.failure')}</p>
      <p className="portal-pairing-text">{t('portal.failureCode', { code: status.code })}</p>
    </>}
    <div className="portal-pairing-actions">
      <Button variant="accent" loading={status.kind === 'busy'} onSelect={() => void reload()}>{t('portal.pairing.reload')}</Button>
      <Button variant="secondary" onSelect={() => { setConfirmFocus(0); setConfirming(true) }}>{t('portal.pairing.newKey')}</Button>
      <Button variant="secondary" onSelect={onBack}>{t('common.back')}</Button>
    </div>
    {confirming && <Modal ariaLabel={t('portal.pairing.newKeyTitle')} onBack={() => setConfirming(false)}
      onDirection={direction => { if (direction === 'left') setConfirmFocus(0); if (direction === 'right') setConfirmFocus(1) }}
      onSelect={() => (confirmFocus === 0 ? setConfirming(false) : void renewKey())}>
      <p className="modal-title">{t('portal.pairing.newKeyTitle')}</p>
      <p className="modal-description">{t('portal.pairing.newKeyText')}</p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmFocus === 0} onSelect={() => setConfirming(false)}>{t('common.cancel')}</Button>
        <Button variant="accent" focused={confirmFocus === 1} onSelect={() => void renewKey()}>{t('portal.pairing.newKeyConfirm')}</Button>
      </div>
    </Modal>}
  </section>
}
