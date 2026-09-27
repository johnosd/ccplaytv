import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDeleteSource, useResyncSource, useSources, type SourceOut } from '../import/importApi'
import { clamp, useRemoteNav, type RemoteDirection } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { Icon } from '../../components/Icon'
import { ExitModal } from '../shell/ExitModal'

export interface ProfilesScreenProps {
  /** `base`: RETURN abre o modal "Sair do CCPlayTV?". `switch`: RETURN chama `onBack` (volta ao Início da lista ativa, FR-031). */
  mode: 'base' | 'switch'
  /** Id da lista que recebe o foco inicial (última usada ou a ativa). Ausente/inexistente → primeira lista, ou "Adicionar lista" (FR-004). */
  initialFocusSourceId?: string | null
  onChooseSource: (source: SourceOut) => void
  onAddSource: () => void
  onEditSource: (source: SourceOut) => void
  onResyncStarted: (jobId: string) => void
  /** Depois de a exclusão confirmada terminar (FR-010/FR-011) — o App despacha `source-removed`. */
  onSourceDeleted?: (sourceId: string) => void
  /** Só chamado em `mode: 'switch'`. */
  onBack: () => void
}

/** Sentinela do cartão "Adicionar lista" — foco é por id, nunca por índice (constitution, "Voltar Restaura Foco e Posição"). */
const ADD_ID = '__add__'

/** Ressincronizar, Editar, Excluir — a linha de ações de um cartão de lista. */
const ACTIONS = ['Ressincronizar', 'Editar', 'Excluir'] as const
const RESYNC = 0
const EDIT = 1

/** Cartões de esqueleto enquanto as listas carregam (só geometria, sem dado). */
const SKELETON_COUNT = 3

function formatStatus(source: SourceOut): string {
  if (source.connection_state === 'error') return 'Erro na última sincronização'
  if (source.connection_state === 'never_synced' || !source.last_successful_sync_at) {
    return 'Nunca sincronizada'
  }
  return `Sincronizada em ${new Date(source.last_successful_sync_at).toLocaleString('pt-BR')}`
}

/** Tipo da lista para o cartão (FR-002). Nunca o endereço nem a credencial (FR-048). */
function formatType(source: SourceOut): string {
  return source.type === 'provider_credentials' ? 'Xtream' : 'M3U'
}

type ScreenState = 'error' | 'loading' | 'empty' | 'ready'

/**
 * "Quem está assistindo?" — perfil = lista (feature 023, ADR-011 §2).
 * Substitui a antiga Home de fontes (`features/home/HomeScreen.tsx`).
 *
 * Foco é estado (ADR-009), por **id** de lista — nunca por índice — para
 * sobreviver a exclusão e a refetch (`logic/foco-shell.md`, § Tela de
 * perfis). Duas linhas: `cards` (listas + "Adicionar lista") e `actions`
 * (Ressincronizar/Editar/Excluir do cartão em foco).
 */
export function ProfilesScreen({
  mode,
  initialFocusSourceId,
  onChooseSource,
  onAddSource,
  onEditSource,
  onResyncStarted,
  onSourceDeleted,
  onBack,
}: ProfilesScreenProps): ReactNode {
  const { data, isLoading, isError, refetch } = useSources()
  const deleteSource = useDeleteSource()
  const resyncSource = useResyncSource()
  const { toastMessage, toastKey, showToast } = useToast()

  const sources = data?.sources ?? []
  const state: ScreenState = isError ? 'error' : isLoading ? 'loading' : sources.length === 0 ? 'empty' : 'ready'
  const ids = [...sources.map((source) => source.id), ADD_ID]

  // `null` = a pessoa ainda não moveu o foco: vale o foco inicial de FR-004,
  // recalculado a cada render — assim ele "chega" sozinho quando as listas
  // terminam de carregar, e nunca briga com um movimento depois (FR-004).
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [row, setRow] = useState<'cards' | 'actions'>('cards')
  const [actionIdx, setActionIdx] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<SourceOut | null>(null)
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0) // 0 = Cancelar (o mais seguro)
  const [showExit, setShowExit] = useState(false)

  const initialId =
    initialFocusSourceId && sources.some((source) => source.id === initialFocusSourceId)
      ? initialFocusSourceId
      : (sources[0]?.id ?? ADD_ID)
  const effectiveId = focusedId !== null && ids.includes(focusedId) ? focusedId : initialId
  const effectiveRow = state === 'ready' && row === 'actions' && effectiveId !== ADD_ID ? 'actions' : 'cards'
  const focusedSource = sources.find((source) => source.id === effectiveId)

  // Rolagem horizontal acompanha o foco (FR-012). `scrollIntoView` não existe
  // em jsdom — a chamada é opcional de propósito.
  const focusedCardRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    focusedCardRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [effectiveId, effectiveRow])

  function runAction(index: number, source: SourceOut) {
    if (index === RESYNC) {
      showToast('Ressincronizando lista...')
      resyncSource.mutate(source.id, {
        onSuccess: (result) => onResyncStarted(result.import_job_id),
      })
    } else if (index === EDIT) {
      onEditSource(source)
    } else {
      if (deleteSource.isPending) return
      setConfirmIdx(0)
      setConfirmDelete(source)
    }
  }

  function confirmDeletion() {
    if (!confirmDelete) return
    const { id } = confirmDelete
    // Foco depois de excluir (FR-011): o cartão que ocupava o lugar dela, ou
    // "Adicionar lista" quando ela era a última — decidido antes de a lista mudar.
    const nextId = sources[sources.findIndex((source) => source.id === id) + 1]?.id ?? ADD_ID
    setConfirmDelete(null)
    deleteSource.mutate(id, {
      onSuccess: () => {
        setRow('cards')
        setFocusedId(nextId)
        onSourceDeleted?.(id)
      },
      onError: () => showToast('Não foi possível excluir a lista.'),
    })
  }

  useRemoteNav({
    onDirection: (direction: RemoteDirection) => {
      if (state === 'error') return

      if (effectiveRow === 'actions') {
        // O limite alcança a última ação (Excluir): senão ela ficaria
        // renderizada e inalcançável pelo controle.
        if (direction === 'up') setRow('cards') // o cartão de onde se desceu (`focusedId`) segue em foco
        if (direction === 'left') setActionIdx((i) => clamp(i - 1, 0, ACTIONS.length - 1))
        if (direction === 'right') setActionIdx((i) => clamp(i + 1, 0, ACTIONS.length - 1))
        return
      }

      const index = ids.indexOf(effectiveId)
      if (direction === 'left' || direction === 'right') {
        const next = clamp(index + (direction === 'left' ? -1 : 1), 0, ids.length - 1)
        // Só um movimento de verdade conta como "já moveu o foco".
        if (next !== index) setFocusedId(ids[next])
        return
      }
      if (direction === 'down' && state === 'ready' && effectiveId !== ADD_ID) {
        setFocusedId(effectiveId)
        setRow('actions')
        // Descer sempre começa em Ressincronizar, nunca herda o índice do
        // cartão — senão descer no terceiro cartão chegava com Excluir em foco
        // e um OK seguido apagaria a lista sem a pessoa ter navegado até lá.
        setActionIdx(0)
      }
    },
    onSelect: () => {
      if (state === 'error') {
        void refetch()
        return
      }
      if (effectiveRow === 'actions') {
        if (focusedSource) runAction(actionIdx, focusedSource)
        return
      }
      if (effectiveId === ADD_ID) onAddSource()
      else if (focusedSource) onChooseSource(focusedSource)
    },
    onBack: () => {
      // RETURN em camadas: a linha de ações é uma camada aberta dentro da tela.
      if (effectiveRow === 'actions') {
        setRow('cards')
        return
      }
      if (mode === 'switch') onBack()
      else setShowExit(true)
    },
  })

  const subtitle =
    state === 'loading'
      ? 'Carregando suas listas…'
      : state === 'empty'
        ? 'Você ainda não tem nenhuma lista. Adicione a primeira.'
        : 'Escolha uma lista'

  return (
    <div className="screen profiles-screen">
      <h1 className="screen-title">Quem está assistindo?</h1>
      {state !== 'error' && <p className="screen-subtitle">{subtitle}</p>}

      {state === 'error' ? (
        <ErrorState
          icon="info"
          title="Não foi possível carregar suas listas"
          description="Houve um problema ao ler as listas guardadas neste aparelho. Tente de novo."
          code="STO-01"
          actions={[{ label: 'Tentar de novo', onSelect: () => void refetch() }]}
          focusedActionIndex={0}
        />
      ) : (
        <div className="source-row" role="group" aria-label="Suas listas" aria-busy={state === 'loading'}>
          {state === 'loading' &&
            Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div className="profiles-skeleton-wrap" key={`skeleton-${i}`}>
                <Skeleton width="var(--profile-card-width)" height="var(--profile-card-height)" />
              </div>
            ))}

          {sources.map((source) => {
            // O cartão "atual" é o de onde se desceu às ações; só ele perde o
            // `tv-focus` para a ação em foco, mas continua marcado.
            const isCurrent = effectiveId === source.id
            const actionsVisible = effectiveRow === 'actions' && isCurrent
            return (
              <div className="source-card-wrap" key={source.id}>
                <button
                  type="button"
                  className={`source-card${isCurrent && effectiveRow === 'cards' && !confirmDelete && !showExit ? ' tv-focus' : ''}${isCurrent ? ' is-current' : ''}`}
                  ref={isCurrent ? focusedCardRef : undefined}
                  onClick={() => onChooseSource(source)}
                >
                  <span className="source-card-icon" aria-hidden="true" />
                  <span className="source-card-name">{source.display_name}</span>
                  <span className="source-card-type">{formatType(source)}</span>
                  <span className="source-card-status">{formatStatus(source)}</span>
                  {source.provider_import_mode === 'legacy_m3u' && (
                    <span className="source-card-badge">Modo limitado</span>
                  )}
                  {source.last_truncated_by_storage && (
                    <span className="source-card-badge">A lista não coube inteira</span>
                  )}
                  {source.last_discarded_by_type > 0 && (
                    <span className="source-card-badge">Entradas não reconhecidas ficaram de fora</span>
                  )}
                </button>
                {actionsVisible && (
                  <div className="source-actions" role="group" aria-label={`Ações de ${source.display_name}`}>
                    {ACTIONS.map((label, index) => (
                      <Button
                        key={label}
                        variant="secondary"
                        // Com o modal de exclusão aberto, a ação de origem
                        // (Excluir) não perde o próprio estado de foco, mas
                        // não deve continuar desenhando o anel — o `Modal` já
                        // é quem tem o teclado (achado na evidência visual da
                        // 023, T045: dois anéis de foco ao mesmo tempo).
                        focused={actionIdx === index && !confirmDelete}
                        onSelect={() => runAction(index, source)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="source-card-wrap">
            <button
              type="button"
              className={`add-card${effectiveId === ADD_ID && !showExit ? ' tv-focus' : ''}`}
              ref={effectiveId === ADD_ID ? focusedCardRef : undefined}
              onClick={onAddSource}
            >
              <Icon name="add" className="add-card-plus" />
              <span className="add-card-label">Adicionar lista</span>
            </button>
          </div>
        </div>
      )}

      <Toast message={toastMessage} messageKey={toastKey} />

      {confirmDelete && (
        <Modal
          ariaLabel={`Excluir a lista ${confirmDelete.display_name}?`}
          onBack={() => setConfirmDelete(null)}
          onDirection={(direction) => {
            if (direction === 'left') setConfirmIdx(0)
            if (direction === 'right') setConfirmIdx(1)
          }}
          onSelect={() => (confirmIdx === 0 ? setConfirmDelete(null) : confirmDeletion())}
        >
          <p className="modal-title">Excluir a lista {confirmDelete.display_name}?</p>
          <p className="modal-description">
            Os favoritos e o ponto de retomada desta lista também serão apagados. Isso não pode ser desfeito.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" focused={confirmIdx === 0} onSelect={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="accent" focused={confirmIdx === 1} onSelect={confirmDeletion}>
              Excluir
            </Button>
          </div>
        </Modal>
      )}

      {showExit && <ExitModal onCancel={() => setShowExit(false)} />}
    </div>
  )
}
