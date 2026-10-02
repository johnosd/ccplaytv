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

export interface EpgSettingsScreenProps {
  sourceId: string
  onBack: () => void
}

const OFFSET_MIN = -12
const OFFSET_MAX = 12

const INVALID_URL_MESSAGE = 'Endereço inválido. Use um endereço começando com http:// ou https://'

function formatOffset(hours: number): string {
  return hours === 0 ? '0 h' : `${hours > 0 ? '+' : ''}${hours} h`
}

function originText(source: SourceOut): string {
  switch (source.epg?.urlOrigin) {
    case 'manual':
      return source.epg_manual_host ? `Endereço informado por você (${source.epg_manual_host})` : 'Endereço informado por você'
    case 'panel':
      return 'Endereço do painel da lista'
    case 'playlist':
      return 'Endereço declarado pela própria lista'
    default:
      return 'Nenhum endereço de EPG. Informe um endereço XMLTV abaixo.'
  }
}

/** Confirmação de "Desativar EPG" (FR-021) — "Cancelar" é o padrão (índice 0), como `DeleteSourceModal`. */
function DisableEpgModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }): ReactNode {
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0)
  return (
    <Modal
      ariaLabel="Desativar o EPG desta lista?"
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setConfirmIdx(0)
        if (direction === 'right') setConfirmIdx(1)
      }}
      onSelect={() => (confirmIdx === 0 ? onCancel() : onConfirm())}
    >
      <p className="modal-title">Desativar o EPG desta lista?</p>
      <p className="modal-description">
        A programação guardada será apagada e a atualização automática para. Você pode ativar de novo quando quiser.
      </p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmIdx === 0} onSelect={onCancel}>
          Cancelar
        </Button>
        <Button variant="accent" focused={confirmIdx === 1} onSelect={onConfirm}>
          Desativar
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
          EPG da lista
        </h1>
        <p className="epg-settings-note" role="status">
          {sourcesQuery.isLoading ? 'Carregando…' : 'Esta lista não está mais disponível.'}
        </p>
        <Button variant="secondary" onSelect={onBack}>
          Voltar
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
    showToast('Sincronizando EPG…')
    syncNow.mutate(sourceId)
  }

  function saveUrl() {
    const trimmed = urlDraft.trim()
    if (trimmed !== '' && !isValidEpgUrl(trimmed)) {
      // FR-018: recusa antes de qualquer download, sem ecoar o que foi digitado, foco de volta ao campo.
      setUrlError(INVALID_URL_MESSAGE)
      urlInputRef.current?.focus()
      return
    }
    setUrlError(undefined)
    setManualUrl.mutate(
      { sourceId, url: trimmed === '' ? undefined : trimmed },
      {
        onSuccess: () => {
          setUrlDraft('')
          showToast(trimmed === '' ? 'Voltando ao endereço da lista. Sincronizando EPG…' : 'Endereço salvo. Sincronizando EPG…')
        },
        onError: () => {
          setUrlError(INVALID_URL_MESSAGE)
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
        EPG da lista {source.display_name}
      </h1>

      <div className="epg-settings-status" role="status">
        <p className="epg-settings-state">{formatEpgStatus(source, syncing)}</p>
        {!disabled && <p className="epg-settings-note">{originText(source)}</p>}
        {state === 'error' && epg?.errorKind && !syncing && (
          <p className="epg-settings-error">
            {epgErrorMessage(epg.errorKind)} <span className="epg-settings-code">{EPG_ERROR_CODE}</span>
          </p>
        )}
      </div>

      {disabled ? (
        <Button
          variant="accent"
          loading={setEnabled.isPending}
          onSelect={() => {
            showToast('EPG ativado. Sincronizando…')
            setEnabled.mutate({ sourceId, enabled: true })
          }}
        >
          Ativar EPG
        </Button>
      ) : (
        <>
          {canSync && (
            <Button variant="accent" loading={syncing} onSelect={startSync}>
              {state === 'error' ? 'Tentar novamente' : 'Sincronizar agora'}
            </Button>
          )}

          <div className="epg-settings-field">
            <TextField
              label="Endereço XMLTV (opcional)"
              purpose="url"
              enterKeyHint="done"
              value={urlDraft}
              onChange={(value) => {
                setUrlDraft(value)
                if (urlError) setUrlError(undefined)
              }}
              error={urlError}
              hint="Deixe em branco e salve para usar o endereço da própria lista."
              inputRef={urlInputRef}
            />
            <Button variant="secondary" loading={setManualUrl.isPending} onSelect={saveUrl} buttonRef={saveUrlRef}>
              Salvar endereço
            </Button>
          </div>

          <div className="epg-settings-offset" role="group" aria-label="Deslocamento de horário">
            <span className="epg-settings-offset-label">Deslocamento de horário</span>
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
            Desativar EPG
          </Button>
        </>
      )}

      <Button variant="ghost" onSelect={onBack}>
        Voltar
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
