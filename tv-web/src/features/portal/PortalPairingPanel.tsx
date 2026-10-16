import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PortalConnection } from '../../lib/portal/portalConnection'
import { FixedQr } from '../../components/FixedQr'
import { RefreshButton, RefreshStatusLine } from '../../components/RefreshButton'
import { usePairingCredentials } from '../../lib/portal/usePairingCredentials'
import { useRefreshAction } from '../../lib/portal/useRefreshAction'
import './portalPairing.css'

export interface PortalPairingPanelProps {
  /** Conexão do portal; ausente = app sem portal configurado (estado honesto, sem dado inventado). */
  connection?: PortalConnection
  /** Voltar: sai da tela Adicionar (RETURN equivalente). */
  onBack: () => void
  /** Recarregar trouxe listas novas — o chamador decide para onde ir (a tela de listas, com foco na nova por id). */
  onReloaded?: (newSourceId?: string) => void
}

/**
 * Tela "Adicionar pelo site" (features 070 e 071, US1/US5): ID do dispositivo, chave do dispositivo, endereço do
 * painel e QR fixo visíveis sem ação extra, com só dois botões: Recarregar e Voltar. A chave aparece aqui e na tela de
 * bloqueio (constitution 1.11.0, (a) e (f)); o QR é gerado na TV, sem requisição, com ID e chave só no fragmento.
 * Abrir a tela cadastra o dispositivo uma vez; o resto é botão. Gerar uma nova chave (invalidar QR e acessos)
 * fica em Configurações → Portal & licença ("Avançado → Gerar nova chave e código"), longe de quem só quer adicionar a lista.
 */
export function PortalPairingPanel({ connection, onBack, onReloaded }: PortalPairingPanelProps): ReactNode {
  const t = useT()
  const pairing = usePairingCredentials(connection)
  const refresh = useRefreshAction('lists')
  const { device } = pairing

  async function reload() {
    const result = await refresh.run()
    // Primeira vez sem internet: o Atualizar cadastrou o dispositivo agora, então completa ID/chave/QR.
    if (result.ok && !pairing.qrUrl) void pairing.retry()
    if (result.ok && result.changed) onReloaded?.(result.newSourceIds[0])
  }

  if (!connection) {
    return <section className="portal-pairing" aria-labelledby="pairing-title">
      <h3 id="pairing-title" className="source-setup-panel-title">{t('portal.pairing.title')}</h3>
      <p className="portal-pairing-text" role="status">{t('portal.unconfigured')}</p>
      <div className="portal-pairing-actions"><Button variant="secondary" onSelect={onBack}>{t('common.back')}</Button></div>
    </section>
  }

  const failureCode = pairing.state === 'failed' ? pairing.code : undefined
  return <section className="portal-pairing" aria-labelledby="pairing-title">
    <h3 id="pairing-title" className="source-setup-panel-title">{t('portal.pairing.title')}</h3>
    {/* QR em destaque, à esquerda; site, ID e chave como alternativa ao lado. */}
    <div className="portal-pairing-hero">
      <div className="portal-pairing-qr">
        <div className="portal-pairing-qr-frame">
          {pairing.qrUrl ? <FixedQr value={pairing.qrUrl} label={t('portal.qrAlt')} />
            : <p className="portal-pairing-text" role={pairing.state === 'loading' ? 'status' : undefined}>
              {pairing.state === 'loading' ? t('portal.pairing.loading') : '—'}</p>}
        </div>
        <p className="portal-pairing-qr-caption">{t('portal.pairing.qr')}</p>
      </div>
      <div className="portal-pairing-info">
        <p className="portal-pairing-text">{t('portal.pairing.useIdKey')}</p>
        <p className="portal-pairing-text">{t('portal.pairing.site')} <b className="portal-pairing-url">{pairing.site}</b></p>
        <dl className="portal-pairing-credentials">
          <div><dt>{t('portal.pairing.deviceId')}</dt><dd><span className="portal-pairing-value">{device?.displayId ?? '—'}</span></dd></div>
          <div><dt>{t('portal.pairing.deviceKey')}</dt><dd><span className="portal-pairing-value">{device?.displayId ? device.deviceKey : '—'}</span></dd></div>
        </dl>
      </div>
    </div>
    <p className="portal-pairing-text portal-pairing-hint">{t('portal.pairing.afterAdd')}</p>
    <RefreshStatusLine action={refresh} scope="lists" />
    {failureCode && refresh.status !== 'failed' && <>
      <p className="portal-pairing-text" role="alert">{t('portal.failure')}</p>
      <p className="portal-pairing-text">{t('portal.failureCode', { code: failureCode })}</p>
    </>}
    <div className="portal-pairing-actions">
      <RefreshButton action={refresh} variant="accent" label={t('portal.pairing.reload')} onRun={() => void reload()} />
      <Button variant="secondary" onSelect={onBack}>{t('common.back')}</Button>
    </div>
  </section>
}
