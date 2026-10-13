import { ConfigurationManager } from './ConfigurationManager'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { api, newOperationId, PortalApiError, type Dashboard, type LicenseDevice, type Session, type Source } from './api'
import { SourceForm } from './SourceForm'
import { OperationStatus } from './OperationStatus'

export function SourceManager({ session, onLogout, onOpenLicense }: { session: Session; onLogout: () => void; onOpenLicense?: () => void }) {
  const t = useT()
  const [dashboard, setDashboard] = useState<Dashboard>()
  const [device, setDevice] = useState<LicenseDevice>()
  const [deviceError, setDeviceError] = useState<PortalApiError>()
  const [error, setError] = useState<PortalApiError>()
  const [notice, setNotice] = useState<'sent' | 'serviceDeleted' | 'servicePending'>()
  const [editing, setEditing] = useState<{ source?: Source; sourceId: string; revision: number }>()
  const [removing, setRemoving] = useState<Pick<Source, 'id' | 'displayName'>>()
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<string | null>(null)
  const loading = useRef(false)
  const alive = useRef(true)
  const deletionRequest = useRef<{ sourceId: string; revision: number; operationId: string } | null>(null)
  async function refresh() {
    if (loading.current) return
    loading.current = true
    try { const value = await api.dashboard(); if (alive.current) { setDashboard(value); setError(undefined) } }
    catch (caught) { if (alive.current) setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { loading.current = false }
  }
  async function refreshDevice() {
    try {
      const value = await api.licenseDevice()
      if (value.deviceId !== session.deviceId || !value.displayId) throw new PortalApiError('invalid')
      if (alive.current) { setDevice(value); setDeviceError(undefined) }
    } catch (caught) {
      if (alive.current) setDeviceError(caught instanceof PortalApiError ? caught : new PortalApiError('network'))
    }
  }
  useEffect(() => {
    alive.current = true
    void refresh()
    void refreshDevice()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') { void refresh(); void refreshDevice() } }, 10000)
    return () => { alive.current = false; clearInterval(timer) }
  }, [session.deviceId])
  useEffect(() => {
    if (!removing || !dialog.current) return
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    cancelButton.current?.focus()
    return () => { element.close(); if (previous?.isConnected) previous.focus() }
  }, [removing])
  const sources = new Map<string, Source>()
  for (const source of dashboard?.snapshot?.sources ?? []) if (['provider_credentials', 'm3u_url'].includes(source.type)) sources.set(source.id, source)
  for (const source of dashboard?.configurations ?? []) if (!sources.has(source.sourceId)) {
    sources.set(source.sourceId, { id: source.sourceId, type: source.type, displayName: source.displayName })
  }
  function revision(id: string) {
    return dashboard?.snapshot?.revisions.find(item => item.sourceId === id)?.revision
      ?? dashboard?.configurations.find(item => item.sourceId === id)?.appliedRevision ?? 0
  }
  async function remove() {
    if (!removing || busy) return
    const request = deletionRequest.current ?? { sourceId: removing.id, revision: revision(removing.id), operationId: newOperationId() }
    deletionRequest.current = request
    setBusy(true)
    setError(undefined)
    try {
      const result = await api.submit(session, { action: 'source.delete', sourceId: request.sourceId, expectedRevision: request.revision }, request.operationId)
      const state = (result as unknown as { serviceState: string }).serviceState
      setNotice(state === 'deleted' ? 'serviceDeleted' : 'servicePending')
      setRemoving(undefined)
      deletionRequest.current = null
      await refresh()
    } catch (caught) {
      const failure = caught instanceof PortalApiError ? caught : new PortalApiError('network')
      setError(failure)
      if (failure.code !== 'network') deletionRequest.current = null
    } finally { setBusy(false) }
  }
  async function cancel(operationId: string) {
    if (busy) return
    setBusy(true)
    try { await api.cancel(session, operationId); await refresh() }
    catch (caught) { setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { setBusy(false) }
  }
  async function logout() {
    if (busy) return
    setBusy(true)
    try { await api.logout(session); onLogout() }
    catch (caught) {
      const failure = caught instanceof PortalApiError ? caught : new PortalApiError('network')
      if (failure.code === 'access') onLogout()
      else setError(failure)
    } finally { setBusy(false) }
  }
  // Adicionar/Editar é uma tela própria: abre com foco no "voltar" e, ao fechar, devolve o foco a quem a abriu.
  function openEditor(value: NonNullable<typeof editing>, focusKey: string) { returnFocus.current = focusKey; setEditing(value) }
  const startAdd = () => openEditor({ sourceId: 'source-' + crypto.randomUUID(), revision: 0 }, 'add')
  const editingKey = editing?.sourceId
  useEffect(() => {
    if (editingKey) { window.scrollTo(0, 0); backButton.current?.focus(); return }
    const key = returnFocus.current
    returnFocus.current = null
    if (key) document.querySelector<HTMLElement>('[data-focus-key="' + CSS.escape(key) + '"]')?.focus()
  }, [editingKey])
  const notices = (error || notice || !dashboard || dashboard.stale) && <div className="library-notices">
    {error && <p role="alert">{t(error.code)}</p>}
    {notice && <p role="status" className="notice is-success">{t(notice)}</p>}
    {!dashboard && <p role="status" className="notice">{t('loading')}</p>}
    {dashboard?.stale && <p role="status" className="notice is-warning">{t(dashboard.snapshot ? 'stale' : 'noSnapshot')}</p>}
  </div>
  if (dashboard && editing) return <div className="management-page editor-view">
    <nav className="editor-breadcrumb" aria-label={t('sources')}>
      <button ref={backButton} className="ghost small" onClick={() => setEditing(undefined)}><span aria-hidden="true">←</span>{t('sources')}</button>
      <span aria-hidden="true">/</span><span aria-current="page">{t(editing.source ? 'edit' : 'add')}</span>
    </nav>
    {notices}
    <SourceForm key={editing.sourceId} source={editing.source}
      saved={!!dashboard.configurations.find(item => item.sourceId === editing.sourceId)} onCancel={() => setEditing(undefined)}
      onSubmit={async (input, operationId) => {
        await api.submit(session, { action: editing.source ? 'source.update' : 'source.create', sourceId: editing.sourceId,
          expectedRevision: editing.revision, input }, operationId)
        setNotice('sent'); setEditing(undefined); await refresh()
      }} />
  </div>
  return <div className="management-page">
    <section className="panel management-device" aria-labelledby="device-header">
      <div className="management-device-heading">
        <span className="device-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="2.5" y="4" width="19" height="13" rx="2.5" /><path d="M8 21h8M12 17v4" /></svg></span>
        <div><p className="eyebrow">{t('destination')}</p><h2 id="device-header">{t('deviceHeader')}</h2></div>
      </div>
      <dl className="management-metrics">
        <div><dt>{t('deviceIdLabel')}</dt><dd className="mono">{device?.displayId ?? '—'}</dd></div>
        <div><dt>{t('licenseStatus')}</dt><dd>{device ? <span className={'status-badge ' + licenseTone(device.license.state)}>{t(('license_' + device.license.state) as 'license_trial')}</span> : '—'}</dd></div>
        <div><dt>{t('licenseExpiry')}</dt><dd>{device ? <time dateTime={new Date(device.license.expiresAt).toISOString()}>{new Date(device.license.expiresAt).toLocaleDateString(t('lang'))}</time> : '—'}</dd></div>
      </dl>
      {deviceError && <p role="alert">{t(deviceError.code)}</p>}
      <div className="actions management-actions">
        <button className="small" onClick={() => { void refresh(); void refreshDevice() }}>{t('refresh')}</button>
        <button className="small primary" onClick={onOpenLicense}>{t('activateByPayment')}</button>
        <button className="small ghost" onClick={() => void logout()}>{t('logout')}</button>
      </div>
    </section>
    {notices}
    {dashboard && <>

      <section aria-labelledby="sources-title">
        <div className="library-header">
          <h2 id="sources-title">{t('sources')}{sources.size > 0 && <span className="library-count" aria-hidden="true">{sources.size}</span>}</h2>
          {dashboard.snapshot && <p className="library-meta">{t('lastContact')}: <time dateTime={dashboard.snapshot.capturedAt}>{new Date(dashboard.snapshot.capturedAt).toLocaleString()}</time></p>}
        </div>
        <div className="source-list-grid">
        {sources.size === 0 && <div className="source-list-empty">
          <span className="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 6h16M4 12h10M4 18h7" /><path d="M18 15v6M15 18h6" /></svg></span>
          <p>{t('empty')}</p>
          <button className="primary" data-focus-key="add" onClick={startAdd}><span aria-hidden="true">+</span>{t('add')}</button>
        </div>}
        {[...sources.values()].map(source => {
          const saved = dashboard.configurations.find(item => item.sourceId === source.id)
          const operation = [...dashboard.operations].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).find(item => item.sourceId === source.id)
          const deleting = operation?.action === 'source.delete'
          return <div className="source-card-wrap" key={source.id}>
            <article className="panel source-list-card" aria-labelledby={'source-' + source.id}>
              <span className={'source-list-icon list-avatar--' + listAvatarVariant(source.id)} aria-hidden="true">{sourceInitials(source.displayName)}</span>
              <h3 id={'source-' + source.id} title={source.displayName}>{source.displayName}</h3>
              <p className="source-list-meta">{t(source.type === 'provider_credentials' ? 'xtream' : 'm3u')}<span aria-hidden="true"> · </span>{t(saved ? 'saved' : 'notSaved')}</p>
              {operation && <OperationStatus operation={operation} onCancel={() => void cancel(operation.operationId)} />}
            </article>
            {!deleting && <div className="actions source-card-actions">
              <button className="small ghost" data-focus-key={'edit-' + source.id} onClick={() => openEditor({ source, sourceId: source.id, revision: revision(source.id) }, 'edit-' + source.id)}>{t('edit')}</button>
              <button className="small ghost danger" onClick={() => { deletionRequest.current = null; setRemoving(source) }}>{t('remove')}</button></div>}
            {deleting && operation.state === 'conflict' && <button className="small" onClick={() => { deletionRequest.current = null; setRemoving(source) }}>{t('retryRemoval')}</button>}
            {saved && !deleting && <ConfigurationManager session={session} sourceId={source.id}
              revision={dashboard.snapshot ? dashboard.snapshot.revisions.find(item => item.sourceId === source.id)?.revision ?? 0 : revision(source.id)}
              fresh={!dashboard.stale && !!dashboard.snapshot} pending={!!saved.operationId}
              onSent={async () => { setNotice('sent'); await refresh() }} />}
          </div>
        })}
        {dashboard.operations.filter(operation => operation.action === 'source.delete' && !sources.has(operation.sourceId)).map(operation => <article className="panel source-list-card" key={operation.operationId}>
          <h3>{t('remove')}: {operation.sourceId}</h3>
          <OperationStatus operation={operation} onCancel={() => {}} />
          {operation.state === 'conflict' && <button className="small" onClick={() => { deletionRequest.current = null; setRemoving({ id: operation.sourceId, displayName: operation.sourceId }) }}>{t('retryRemoval')}</button>}
        </article>)}
        {sources.size > 0 && <div className="source-list-add-card">
          <button className="source-list-add-card-button" data-focus-key="add" onClick={startAdd} aria-label={t('add')}>
            <span className="source-list-add-icon" aria-hidden="true">+</span><span>{t('add')}</span>
          </button>
        </div>}
        </div>
      </section>
      {removing && <dialog ref={dialog} className="panel" aria-labelledby="delete-title" onCancel={event => { event.preventDefault(); if (!busy) { setRemoving(undefined); deletionRequest.current = null } }}>
        <h2 id="delete-title">{t('remove')}: {removing.displayName}</h2><p>{t('removeHint')}</p>
        <div className="actions"><button className="primary" onClick={() => void remove()} aria-disabled={busy}>{t(busy ? 'sending' : 'confirm')}</button>
          <button ref={cancelButton} disabled={busy} onClick={() => { setRemoving(undefined); deletionRequest.current = null }}>{t('cancel')}</button></div>
      </dialog>}
    </>}
  </div>
}

function licenseTone(state: LicenseDevice['license']['state']) {
  return state === 'active' ? 'is-success' : state === 'trial' ? 'is-warning' : 'is-danger'
}

// Mesmo par de cores estável por id que a tela de listas da TV (tv-web/src/features/profiles/listAvatar.ts).
function listAvatarVariant(sourceId: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < sourceId.length; i++) { hash ^= sourceId.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0 }
  return hash % 6
}

function sourceInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : words[0]?.slice(0, 2) ?? '?').toUpperCase()
}
