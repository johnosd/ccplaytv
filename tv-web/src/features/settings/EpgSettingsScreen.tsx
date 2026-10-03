import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  EPG_ERROR_CODE,
  epgErrorMessage,
  isValidEpgUrl,
  useEpgSyncing,
  useSetEpgEnabled,
  useSetEpgManualUrl,
  useSetEpgOffset,
  useSources,
  useSyncEpgNow,
  type SourceOut,
} from '../import/importApi'
import { formatEpgStatus } from '../sources/sourceFormat'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useImeChain } from '../../lib/useImeChain'
import { useToast } from '../../lib/useToast'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { TextField } from '../../components/TextField'
import { Toast } from '../../components/Toast'
import { useT } from '../../lib/i18n/I18nProvider'
import type { Translator } from '../../lib/i18n/translate'

export interface EpgSettingsScreenProps {
  sourceId: string
  onBack: () => void
}

const OFFSET_MIN = -12
const OFFSET_MAX = 12

function formatOffset(hours: number): string {
  return hours === 0 ? '0 h' : `${hours > 0 ? '+' : ''}${hours} h`
}

function originText(source: SourceOut, t: Translator): string {
  switch (source.epg?.urlOrigin) {
    case 'manual':
      return source.epg_manual_host
        ? t('settings.epg.origin.manualHost', { host: source.epg_manual_host })
        : t('settings.epg.origin.manual')
    case 'panel':
      return t('settings.epg.origin.panel')
    case 'playlist':
      return t('settings.epg.origin.playlist')
    default:
      return t('settings.epg.origin.none')
  }
}

/** Confirmação de "Desativar EPG" (FR-021) — "Cancelar" é o padrão (índice 0), como `DeleteSourceModal`. */
function DisableEpgModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }): ReactNode {
  const t = useT()
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0)
  return (
    <Modal
      ariaLabel={t('settings.epg.disableTitle')}
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setConfirmIdx(0)
        if (direction === 'right') setConfirmIdx(1)
      }}
      onSelect={() => (confirmIdx === 0 ? onCancel() : onConfirm())}
    >
      <p className="modal-title">{t('settings.epg.disableTitle')}</p>
      <p className="modal-description">{t('settings.epg.disableDescription')}</p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmIdx === 0} onSelect={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="accent" focused={confirmIdx === 1} onSelect={onConfirm}>
          {t('settings.epg.disableConfirm')}
        </Button>
      </div>
    </Modal>
  )
}

/**
 * EPG da lista (feature 030, US2, `logic/tela-epg-configuracoes.md`): estado,
 * origem do endereço, endereço XMLTV manual, deslocamento de horário,
 * sincronizar e desativar. Foco DOM real (`useTvKeyNav`), como a tela de
 * edição de lista — que já prova o IME da TV nesse molde (features 023/026).
 *
 * **Nunca mostra nem pré-preenche um endereço** (FR-017): o campo começa
 * vazio, e a origem aparece só como texto descritivo (no máximo o host).
 * Todo estado tem pelo menos um botão focável (FR-022).
 */
export function EpgSettingsScreen({ sourceId, onBack }: EpgSettingsScreenProps): ReactNode {
  const t = useT()
  const containerRef = useRef<HTMLElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const saveUrlRef = useRef<HTMLButtonElement>(null)
  useTvKeyNav(containerRef)
  useImeChain(containerRef, saveUrlRef) // Done do IME leva o foco a "Salvar endereço", sem enviar (feature 045)
  useRemoteNav({ onBack })

  const sourcesQuery = useSources()
  const source = sourcesQuery.data?.sources.find((candidate) => candidate.id === sourceId)
  const syncing = useEpgSyncing(sourceId)

  const [urlDraft, setUrlDraft] = useState('')
  const [urlError, setUrlError] = useState<string | undefined>(undefined)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const { toastMessage, toastKey, showToast } = useToast()

  const syncNow = useSyncEpgNow()
  const setManualUrl = useSetEpgManualUrl()
  const setOffset = useSetEpgOffset()
  const setEnabled = useSetEpgEnabled()

  if (!source) {
    // Carregando a lista de fontes, ou a fonte já não existe: nunca um beco sem saída.
    return (
      <section className="screen epg-settings" ref={containerRef} aria-labelledby="epg-settings-title">
        <h1 id="epg-settings-title" className="screen-title">
          {t('settings.epg.title')}
        </h1>
        <p className="epg-settings-note" role="status">
          {sourcesQuery.isLoading ? t('common.loading') : t('settings.epg.unavailable')}
        </p>
        <Button variant="secondary" onSelect={onBack}>
          {t('common.back')}
        </Button>
      </section>
    )
  }

  const epg = source.epg
  const state = epg?.state ?? 'not_configured'
  const offsetHours = epg?.offsetHours ?? 0
  const disabled = state === 'disabled'
  const canSync = state === 'never_synced' || state === 'linked' || state === 'error'

  function startSync() {
    if (syncing) return
    showToast(t('settings.epg.syncing'))
    syncNow.mutate(sourceId)
  }

  function saveUrl() {
    const trimmed = urlDraft.trim()
    if (trimmed !== '' && !isValidEpgUrl(trimmed)) {
      // FR-018: recusa antes de qualquer download, sem ecoar o que foi digitado, foco de volta ao campo.
      setUrlError(t('settings.epg.invalidUrl'))
      urlInputRef.current?.focus()
      return
    }
    setUrlError(undefined)
    setManualUrl.mutate(
      { sourceId, url: trimmed === '' ? undefined : trimmed },
      {
        onSuccess: () => {
          setUrlDraft('')
          showToast(trimmed === '' ? t('settings.epg.urlReset') : t('settings.epg.urlSaved'))
        },
        onError: () => {
          setUrlError(t('settings.epg.invalidUrl'))
          urlInputRef.current?.focus()
        },
      },
    )
  }

  function changeOffset(delta: number) {
    const next = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, offsetHours + delta))
    if (next === offsetHours) return
    setOffset.mutate({ sourceId, hours: next })
  }

  return (
    <section className="screen epg-settings no-scrollbar form-scroll-room" ref={containerRef} aria-labelledby="epg-settings-title">
      <h1 id="epg-settings-title" className="screen-title">
        {t('settings.epg.titleNamed', { name: source.display_name })}
      </h1>

      <div className="epg-settings-status" role="status">
        <p className="epg-settings-state">{formatEpgStatus(source, syncing, t)}</p>
        {!disabled && <p className="epg-settings-note">{originText(source, t)}</p>}
        {state === 'error' && epg?.errorKind && !syncing && (
          <p className="epg-settings-error">
            {epgErrorMessage(epg.errorKind, t)} <span className="epg-settings-code">{EPG_ERROR_CODE}</span>
          </p>
        )}
      </div>

      {disabled ? (
        <Button
          variant="accent"
          loading={setEnabled.isPending}
          onSelect={() => {
            showToast(t('settings.epg.enabled'))
            setEnabled.mutate({ sourceId, enabled: true })
          }}
        >
          {t('settings.epg.enable')}
        </Button>
      ) : (
        <>
          {canSync && (
            <Button variant="accent" loading={syncing} onSelect={startSync}>
              {state === 'error' ? t('settings.epg.retry') : t('settings.epg.syncNow')}
            </Button>
          )}

          <div className="epg-settings-field">
            <TextField
              label={t('settings.epg.urlField')}
              purpose="url"
              enterKeyHint="done"
              value={urlDraft}
              onChange={(value) => {
                setUrlDraft(value)
                if (urlError) setUrlError(undefined)
              }}
              error={urlError}
              hint={t('settings.epg.urlHint')}
              inputRef={urlInputRef}
            />
            <Button variant="secondary" loading={setManualUrl.isPending} onSelect={saveUrl} buttonRef={saveUrlRef}>
              {t('settings.epg.saveUrl')}
            </Button>
          </div>

          <div className="epg-settings-offset" role="group" aria-label={t('settings.epg.offset')}>
            <span className="epg-settings-offset-label">{t('settings.epg.offset')}</span>
            <Button variant="secondary" onSelect={() => changeOffset(-1)}>
              − 1 h
            </Button>
            <span className="epg-settings-offset-value" aria-live="polite">
              {formatOffset(offsetHours)}
            </span>
            <Button variant="secondary" onSelect={() => changeOffset(1)}>
              + 1 h
            </Button>
          </div>

          <Button variant="secondary" onSelect={() => setConfirmDisable(true)}>
            {t('settings.epg.disable')}
          </Button>
        </>
      )}

      <Button variant="ghost" onSelect={onBack}>
        {t('common.back')}
      </Button>

      {confirmDisable && (
        <DisableEpgModal
          onCancel={() => setConfirmDisable(false)}
          onConfirm={() => {
            setConfirmDisable(false)
            setEnabled.mutate({ sourceId, enabled: false })
          }}
        />
      )}
      <Toast message={toastMessage} messageKey={toastKey} />
    </section>
  )
}
