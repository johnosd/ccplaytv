import { ConfigurationManager } from './ConfigurationManager'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { api, newOperationId, PortalApiError, type Dashboard, type Session, type Source } from './api'
import { SourceForm } from './SourceForm'
import { OperationStatus } from './OperationStatus'

export function SourceManager({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const t = useT()
  const [dashboard, setDashboard] = useState<Dashboard>()
  const [error, setError] = useState<PortalApiError>()
  const [notice, setNotice] = useState<'sent' | 'serviceDeleted' | 'servicePending'>()
  const [editing, setEditing] = useState<{ source?: Source; sourceId: string; revision: number }>()
  const [removing, setRemoving] = useState<Pick<Source, 'id' | 'displayName'>>()
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
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
  useEffect(() => {
    alive.current = true
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10000)
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
  return <>
    <section className="panel" aria-label={t('destination')}><p>{t('destination')}</p><strong>{session.deviceId}</strong>
      <div className="actions"><button onClick={() => void refresh()}>{t('refresh')}</button><button onClick={() => void logout()}>{t('logout')}</button></div>
    </section>
    {error && <p role="alert">{t(error.code)}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {!dashboard && <p role="status">{t('loading')}</p>}
    {dashboard && <>
      {dashboard.stale && <p role="status">{t(dashboard.snapshot ? 'stale' : 'noSnapshot')}</p>}
      {dashboard.snapshot && <p>{t('lastContact')}: <time dateTime={dashboard.snapshot.capturedAt}>{new Date(dashboard.snapshot.capturedAt).toLocaleString()}</time></p>}
      {editing ? <SourceForm key={editing.sourceId} source={editing.source}
        saved={!!dashboard.configurations.find(item => item.sourceId === editing.sourceId)} onCancel={() => setEditing(undefined)}
        onSubmit={async (input, operationId) => {
          await api.submit(session, { action: editing.source ? 'source.update' : 'source.create', sourceId: editing.sourceId,
            expectedRevision: editing.revision, input }, operationId)
          setNotice('sent'); setEditing(undefined); await refresh()
        }} /> : <button className="primary" onClick={() => setEditing({ sourceId: 'source-' + crypto.randomUUID(), revision: 0 })}>{t('add')}</button>}
      <section aria-labelledby="sources-title"><h2 id="sources-title">{t('sources')}</h2>
        {sources.size === 0 && <p>{t('empty')}</p>}
        {[...sources.values()].map(source => {
          const saved = dashboard.configurations.find(item => item.sourceId === source.id)
          const operation = [...dashboard.operations].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).find(item => item.sourceId === source.id)
          const deleting = operation?.action === 'source.delete'
          return <article className="panel" key={source.id}>
            <h3>{source.displayName}</h3><p>{t(source.type === 'provider_credentials' ? 'xtream' : 'm3u')}</p>
            <p>{t(saved ? 'saved' : 'notSaved')}</p>
            {!deleting && <div className="actions"><button onClick={() => setEditing({ source, sourceId: source.id, revision: revision(source.id) })}>{t('edit')}</button>
              <button onClick={() => { deletionRequest.current = null; setRemoving(source) }}>{t('remove')}</button></div>}
            {saved && !deleting && <ConfigurationManager session={session} sourceId={source.id}
              revision={dashboard.snapshot ? dashboard.snapshot.revisions.find(item => item.sourceId === source.id)?.revision ?? 0 : revision(source.id)}
              fresh={!dashboard.stale && !!dashboard.snapshot} pending={!!saved.operationId}
              onSent={async () => { setNotice('sent'); await refresh() }} />}
            {deleting && operation.state === 'conflict' && <button onClick={() => { deletionRequest.current = null; setRemoving(source) }}>{t('retryRemoval')}</button>}
            {operation && <OperationStatus operation={operation} onCancel={() => void cancel(operation.operationId)} />}
          </article>
        })}
        {dashboard.operations.filter(operation => operation.action === 'source.delete' && !sources.has(operation.sourceId)).map(operation => <article className="panel" key={operation.operationId}>
          <h3>{t('remove')}: {operation.sourceId}</h3>
          <OperationStatus operation={operation} onCancel={() => {}} />
          {operation.state === 'conflict' && <button onClick={() => { deletionRequest.current = null; setRemoving({ id: operation.sourceId, displayName: operation.sourceId }) }}>{t('retryRemoval')}</button>}
        </article>)}
      </section>
      {removing && <dialog ref={dialog} className="panel" aria-labelledby="delete-title" onCancel={event => { event.preventDefault(); if (!busy) { setRemoving(undefined); deletionRequest.current = null } }}>
        <h2 id="delete-title">{t('remove')}: {removing.displayName}</h2><p>{t('removeHint')}</p>
        <div className="actions"><button className="primary" onClick={() => void remove()} aria-disabled={busy}>{t(busy ? 'sending' : 'confirm')}</button>
          <button ref={cancelButton} disabled={busy} onClick={() => { setRemoving(undefined); deletionRequest.current = null }}>{t('cancel')}</button></div>
      </dialog>}
    </>}
  </>
}
