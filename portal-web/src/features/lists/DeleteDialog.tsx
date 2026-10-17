import { useEffect, useRef } from 'react'
import { useT, type MessageKey } from '../../lib/i18n'

/**
 * Confirmação de exclusão de lista (feature 077, D-005): `<dialog>` modal com **Cancelar** (foco inicial) e **Sim,
 * excluir**; Esc cancela; ao fechar o foco volta a quem abriu. Cancelar nunca envia nada. Os textos têm padrão de lista;
 * a chave TMDB (077/US4) reaproveita o mesmo diálogo trocando título, texto e rótulo de confirmação.
 */
export function DeleteDialog({ name, busy, onConfirm, onCancel, title = 'listDeleteTitle', text = 'listDeleteText', confirm = 'listDeleteConfirm' }: {
  name: string; busy: boolean; onConfirm: () => void; onCancel: () => void
  title?: MessageKey; text?: MessageKey; confirm?: MessageKey
}) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    cancel.current?.focus()
    return () => { element.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog ref={dialog} className="panel" aria-labelledby="delete-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id="delete-title">{t(title)}</h2>
    <p><strong>{name}</strong></p>
    <p>{t(text)}</p>
    <div className="actions">
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
      <button type="button" className="primary" aria-disabled={busy} onClick={onConfirm}>{t(busy ? 'sending' : confirm)}</button>
    </div>
  </dialog>
}
