import { useEffect, useRef, useState } from 'react'
import { useT } from '../../lib/i18n'
import { api, newOperationId, PortalApiError, type Session, type Source } from '../api'
import { useTvDataContext } from '../shell/TvDataProvider'
import { DeleteDialog } from './DeleteDialog'
import { ListCard } from './ListCard'
import { ListEditor } from './ListEditor'
import { collectLists, listStatus, orphanDeletions, revisionOf, type ListStatus } from './listStatus'

type Editing = { source?: Source; sourceId: string; revision: number }
type Notice = 'sent' | 'deleted' | 'applied' | undefined

/**
 * Listas (feature 077, US2): cartões com selo de estado, ações só quando precisam e editor em tela própria (empilhada no
 * histórico — Voltar do celular fecha). Toda mudança diz o próximo passo ("na TV, aperte Atualizar"). Lê do contexto
 * compartilhado (`useTvData`): nenhum timer próprio. Exclusão e reenvio reaproveitam o `operationId` após falha de rede.
 */
export function ListsPage({ session, view, onOpenEditor, onCloseEditor }: {
  session: Session; view: string; onOpenEditor: () => void; onCloseEditor: () => void
}) {
  const t = useT()
  const { dashboard, dashboardError, refresh, setDashboardError } = useTvDataContext()
  const [editing, setEditing] = useState<Editing>()
  const [removing, setRemoving] = useState<Pick<Source, 'id' | 'displayName'>>()
  const [notice, setNotice] = useState<Notice>()
  const [busy, setBusy] = useState(false)
  const returnFocus = useRef<string | null>(null)
  const deletion = useRef<{ sourceId: string; revision: number; operationId: string } | null>(null)
  const resends = useRef(new Map<string, { id: string; revision: number }>())
  const previousStatuses = useRef(new Map<string, ListStatus>())
  const editorOpen = view === 'editor' && !!editing
  // Voltar (ou Esc do navegador) fecha o editor: devolve o foco a quem o abriu.
  useEffect(() => {
    if (view === 'editor') return
    setEditing(undefined)
    const key = returnFocus.current
    returnFocus.current = null
    if (key) document.querySelector<HTMLElement>('[data-focus-key="' + CSS.escape(key) + '"]')?.focus()
  }, [view])
  useEffect(() => {
    if (!dashboard) return
    const currentStatuses = new Map<string, ListStatus>()
    for (const source of collectLists(dashboard)) {
      const saved = dashboard.configurations.find(item => item.sourceId === source.id)
      currentStatuses.set(source.id, listStatus(source.id, saved, dashboard.operations, dashboard.snapshot).status)
    }
    if ([...currentStatuses].some(([sourceId, status]) => previousStatuses.current.get(sourceId) === 'waiting' && status === 'onTv')) {
      setNotice('applied')
    }
    previousStatuses.current = currentStatuses
  }, [dashboard])

  const fail = (caught: unknown) => setDashboardError(caught instanceof PortalApiError ? caught : new PortalApiError('network'))
  function open(value: Editing, focusKey: string) { returnFocus.current = focusKey; setEditing(value); onOpenEditor() }
  async function remove() {
    if (!removing || busy || !dashboard) return
    const request = deletion.current ?? { sourceId: removing.id, revision: revisionOf(dashboard, removing.id), operationId: newOperationId() }
    deletion.current = request
    setBusy(true); setDashboardError(undefined)
    try {
      await api.submit(session, { action: 'source.delete', sourceId: request.sourceId, expectedRevision: request.revision }, request.operationId)
      setNotice('deleted'); setRemoving(undefined); deletion.current = null
      await refresh()
    } catch (caught) {
      fail(caught)
      if (!(caught instanceof PortalApiError) || caught.code !== 'network') deletion.current = null
    } finally { setBusy(false) }
  }
  async function cancelSend(operationId: string) {
    if (busy) return
    setBusy(true)
    try { await api.cancel(session, operationId); await refresh() } catch (caught) { fail(caught) } finally { setBusy(false) }
  }
  async function resend(sourceId: string, revision: number) {
    if (busy) return
    const request = resends.current.get(sourceId) ?? { id: newOperationId(), revision }
    resends.current.set(sourceId, request)
    setBusy(true); setDashboardError(undefined)
    try {
      await api.resend(session, sourceId, request.revision, request.id)
      resends.current.delete(sourceId); setNotice('sent'); await refresh()
    } catch (caught) {
      fail(caught)
      if (!(caught instanceof PortalApiError) || caught.code !== 'network') resends.current.delete(sourceId)
    } finally { setBusy(false) }
  }

  if (dashboard && editorOpen && editing) {
    return <ListEditor key={editing.sourceId} source={editing.source} saved={!!dashboard.configurations.find(item => item.sourceId === editing.sourceId)}
      onCancel={onCloseEditor}
      onSubmit={async (input, operationId) => {
        await api.submit(session, { action: editing.source ? 'source.update' : 'source.create', sourceId: editing.sourceId, expectedRevision: editing.revision, input }, operationId)
        setNotice('sent'); onCloseEditor(); await refresh()
      }} />
  }
  const lists = dashboard ? collectLists(dashboard) : []
  const orphans = dashboard ? orphanDeletions(dashboard, lists) : []
  // Uma exclusão pendente sem lista correspondente continua visível: sem ela o estado "vazio" esconderia o que foi enviado.
  const empty = !!dashboard && lists.length === 0 && orphans.length === 0
  const add = <button type="button" className={'primary lists-add' + (empty ? ' is-inline' : '')} data-focus-key="add"
    onClick={() => open({ sourceId: 'source-' + crypto.randomUUID(), revision: 0 }, 'add')}><span aria-hidden="true">+</span>{t('add')}</button>
  return <div className="lists-page">
    <div className="page-header">
      <h1 data-page-title tabIndex={-1}>{t('navLists')}{lists.length > 0 && <span className="library-count" aria-hidden="true">{lists.length}</span>}</h1>
      {dashboard?.snapshot && <p className="library-meta">{t('lastContact')}: <time dateTime={dashboard.snapshot.capturedAt}>{new Date(dashboard.snapshot.capturedAt).toLocaleString(t('lang'))}</time></p>}
    </div>
    <div className="library-notices">
      {dashboardError && <p role="alert">{t(dashboardError.code)}</p>}
      {notice && <p role="status" className="notice is-success">{t(notice === 'sent' ? 'sentNextStep' : notice === 'deleted' ? 'deleteSentNextStep' : 'appliedOnTv')}</p>}
      {!dashboard && !dashboardError && <p role="status" className="notice">{t('loading')}</p>}
      {dashboard?.stale && <p role="status" className="notice is-warning">{t(dashboard.snapshot ? 'stale' : 'noSnapshot')}</p>}
    </div>
    {dashboard && <>
      {empty ? <div className="lists-empty"><p>{t('empty')}</p>{add}</div> : <>
        <div className="list-grid">
          {lists.map(source => {
            const saved = dashboard.configurations.find(item => item.sourceId === source.id)
            const state = listStatus(source.id, saved, dashboard.operations, dashboard.snapshot)
            const revision = revisionOf(dashboard, source.id)
            return <ListCard key={source.id} source={source} saved={!!saved} state={state} busy={busy} resendDisabled={dashboard.stale || !dashboard.snapshot}
              onEdit={() => open({ source, sourceId: source.id, revision }, 'edit-' + source.id)}
              onDelete={() => { deletion.current = null; setRemoving(source) }}
              onRetryDelete={() => { deletion.current = null; setRemoving(source) }}
              onCancelSend={() => state.operation && void cancelSend(state.operation.operationId)}
              onResend={() => void resend(source.id, dashboard.snapshot ? revision : saved?.expectedRevision ?? revision)} />
          })}
          {/* Só exclusões que falharam e que a pessoa pode repetir; exclusão em andamento ou aplicada não é lista nem log. */}
          {orphans.map(operation => <article className="list-card" key={operation.operationId} aria-label={t('deleteNotDone')}>
            <div className="list-card-body"><h3>{t('deleteNotDone')}</h3>
              <p><span className="status-badge is-danger">{t('statusError')}</span></p></div>
            <div className="list-card-actions"><button type="button" className="small"
              onClick={() => { deletion.current = null; setRemoving({ id: operation.sourceId, displayName: t('deleteNotDone') }) }}>{t('retryRemoval')}</button></div>
          </article>)}
        </div>
        {add}
      </>}
      {removing && <DeleteDialog name={removing.displayName} busy={busy} onConfirm={() => void remove()} onCancel={() => { setRemoving(undefined); deletion.current = null }} />}
    </>}
  </div>
}
