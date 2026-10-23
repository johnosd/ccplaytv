import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { TextField } from '../../components/TextField'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { useImeChain } from '../../lib/useImeChain'
import type { RemoteDirection } from '../../lib/useRemoteNav'
import { saveSubtitleKey, type SaveSubtitleKeyFailure } from '../../lib/subtitles/subtitleCredentials'
import type { SubtitleProvider } from '../../lib/subtitles/types'
import { SUBTITLE_PROVIDER_NAME } from './subtitleKeysModel'

export interface SubtitleKeyDialogProps {
  provider: SubtitleProvider
  /** Chave aceita pelo fornecedor e gravada. */
  onSaved: () => void
  onCancel: () => void
}

const FAILURE_KEY: Record<SaveSubtitleKeyFailure, MessageKey> = {
  invalid_format: 'subtitles.keys.failure.invalid_format',
  refused: 'subtitles.keys.failure.refused',
  rate_limited: 'subtitles.keys.failure.rate_limited',
  offline: 'subtitles.keys.failure.offline',
}

/**
 * Digitar a chave pessoal de um fornecedor de legenda (feature 090, US3, `logic §10.2`). IME da TV com foco DOM real
 * dentro de um `Modal`: ↑/↓ andam pelos controles, ←/→ ficam com o cursor do campo, OK no campo abre o teclado do sistema e
 * "Concluído" do teclado leva o foco a "Salvar e testar" (nunca envia sozinho, feature 045). RETURN fecha.
 *
 * **O campo começa sempre vazio** e a chave digitada nunca volta para a tela nem para um erro; uma chave recusada não é
 * gravada e o foco volta ao campo.
 */
export function SubtitleKeyDialog({ provider, onSaved, onCancel }: SubtitleKeyDialogProps): ReactNode {
  const t = useT()
  const name = SUBTITLE_PROVIDER_NAME[provider]
  const containerRef = useRef<HTMLDivElement>(null)

  function focusables(): HTMLElement[] {
    return Array.from(containerRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? [])
  }

  function move(direction: RemoteDirection) {
    const list = focusables()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const step = direction === 'up' || direction === 'left' ? -1 : 1
    list[Math.max(0, Math.min(list.length - 1, at + step))]?.focus()
  }

  return (
    <Modal
      ariaLabel={t('subtitles.keys.dialogTitle', { provider: name })}
      onBack={onCancel}
      onDirection={move}
      onSelect={() => {
        const active = document.activeElement
        if (active instanceof HTMLButtonElement) active.click()
      }}
    >
      <KeyForm provider={provider} name={name} containerRef={containerRef} onSaved={onSaved} onCancel={onCancel} />
    </Modal>
  )
}

interface KeyFormProps {
  provider: SubtitleProvider
  name: string
  containerRef: RefObject<HTMLDivElement | null>
  onSaved: () => void
  onCancel: () => void
}

function KeyForm({ provider, name, containerRef, onSaved, onCancel }: KeyFormProps): ReactNode {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const submitting = useRef(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  useImeChain(containerRef, saveRef)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit() {
    // Trava síncrona: dois OK em sequência rápida passariam pelos dois antes do `busy` renderizar.
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    saveSubtitleKey(provider, draft).then(
      (result) => {
        submitting.current = false
        setBusy(false)
        if (result.ok) return onSaved()
        setError(t(FAILURE_KEY[result.reason]))
        inputRef.current?.focus()
      },
      () => {
        submitting.current = false
        setBusy(false)
        setError(t(FAILURE_KEY.offline))
        inputRef.current?.focus()
      },
    )
  }

  return (
    <div ref={containerRef}>
      <p className="modal-title">{t('subtitles.keys.dialogTitle', { provider: name })}</p>
      <TextField
        label={t('subtitles.keys.field')}
        purpose="password"
        revealable
        revealNoun={t('subtitles.keys.revealNoun')}
        enterKeyHint="done"
        value={draft}
        onChange={(value) => {
          setDraft(value)
          if (error) setError(undefined)
        }}
        error={error}
        hint={t('subtitles.keys.hint', { provider: name })}
        inputRef={inputRef}
      />
      <div className="modal-actions">
        <Button variant="accent" loading={busy} onSelect={submit} buttonRef={saveRef}>
          {t('subtitles.keys.save')}
        </Button>
        <Button variant="secondary" onSelect={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
