import { useState } from 'react'
import { useRemoteNav } from '../lib/useRemoteNav'

export interface ConfirmDialogProps {
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Diálogo modal navegável por controle remoto. Back sempre chama
 * `onCancel` (nunca `onConfirm`) — RETURN fecha a camada aberta antes de
 * qualquer ação de sair da tela/app (constitution: "Toda Ação Essencial
 * Tem Caminho Completo por Controle Remoto").
 */
export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [focusIndex, setFocusIndex] = useState<0 | 1>(0) // 0 = cancelar (padrão, mais seguro)

  useRemoteNav(
    {
      onDirection: (dir) => {
        if (dir === 'left') setFocusIndex(0)
        if (dir === 'right') setFocusIndex(1)
      },
      onSelect: () => (focusIndex === 0 ? onCancel() : onConfirm()),
      onBack: onCancel,
    },
    { modal: true },
  )

  return (
    <div className="confirm-dialog" role="alertdialog" aria-modal="true">
      <div className="confirm-dialog-panel">
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <div className={`confirm-dialog-button${focusIndex === 0 ? ' tv-focus' : ''}`}>
            {cancelLabel}
          </div>
          <div className={`confirm-dialog-button${focusIndex === 1 ? ' tv-focus' : ''}`}>
            {confirmLabel}
          </div>
        </div>
      </div>
    </div>
  )
}
