import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDeleteSource, useResyncSource, useSources, useSourceSyncing, type SourceOut } from '../import/importApi'
import { clamp, useRemoteNav, type RemoteDirection } from '../../lib/useRemoteNav'
import { useToast } from '../../lib/useToast'
import { useOnlineStatus } from '../../lib/onlineStatus'
import { Toast } from '../../components/Toast'
import { Button } from '../../components/Button'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { Icon } from '../../components/Icon'
import { ExitModal } from '../shell/ExitModal'
import { DeleteSourceModal } from '../sources/DeleteSourceModal'
import { formatType, sourceAlertChips } from '../sources/sourceFormat'
import { OnboardingBrand } from '../import/OnboardingBrand'
import { listAvatarVariant, listInitials } from './listAvatar'
import { useT } from '../../lib/i18n/I18nProvider'
import { sourceNotices } from './ProfilesSourceNotices'
import { ProfilesRefreshCorner } from './ProfilesRefreshCorner'
import { useProfilesRefresh } from './useProfilesRefresh'

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
  /** Abre as configurações globais sem exigir lista ativa. */
  onManageSources?: () => void
  /** "Configurar" (feature 067, FR-012) — abre Configurações da lista. Opcional: o contrato travado da 037 não o passa. */
  onConfigureSource?: (source: SourceOut) => void
  /** Só chamado em `mode: 'switch'`. */
  onBack: () => void
}

/** Sentinela do cartão "Adicionar lista" — foco é por id, nunca por índice (constitution, "Voltar Restaura Foco e Posição"). */
const ADD_ID = '__add__'

/**
 * Feature 037 (FR-019): `initialFocusSourceId` com este valor põe o foco
 * inicial em "Adicionar lista", mesmo com listas — é o que o App passa ao
 * voltar do cadastro aberto por esta tela (D-007).
 */
export const ADD_LIST_FOCUS_ID = ADD_ID

/** Ressincronizar, Editar, Excluir, Configurar (feature 067, por último) — a linha de ações de um cartão de lista. */
const ACTION_KEYS = ['settings.sources.resync', 'settings.sources.edit', 'settings.sources.delete', 'listSettings.configure'] as const
const RESYNC = 0
const EDIT = 1
const CONFIGURE = 3

/** Cartões de esqueleto enquanto as listas carregam (só geometria, sem dado). */
const SKELETON_COUNT = 3

type ScreenState = 'error' | 'loading' | 'empty' | 'ready'

/**
 * "Selecione ou Adicione sua lista" — perfil = lista (feature 023, ADR-011 §2),
 * no formato do `profiles()` do protótipo V13.2 desde a feature 037: marca,
 * kicker, título, fileira centralizada de cartões (selo do tipo, avatar de
 * iniciais, nome, avisos), cartão-botão "Adicionar lista", rodapé e
 * "Configurações" no canto. Os nomes de classe `.source-card*`/`.add-card`
 * seguem os mesmos de propósito — são seletores de E2E (D-002 da 037).
 *
 * Foco é estado (ADR-009), por **id** de lista — nunca por índice — para
 * sobreviver a exclusão e a refetch (`logic/foco-shell.md`, § Tela de
 * perfis). Três linhas: `cards` (listas + "Adicionar lista"), `actions`
 * (Ressincronizar/Editar/Excluir/Configurar do cartão em foco) e `manage`
 * ("Configurações", abaixo de "Adicionar lista").
 */
export function ProfilesScreen({
  mode,
  initialFocusSourceId,
  onChooseSource,
  onAddSource,
  onEditSource,
  onResyncStarted,
  onSourceDeleted,
  onManageSources,
  onConfigureSource,
  onBack,
}: ProfilesScreenProps): ReactNode {
  const t = useT()
  const { data, isLoading, isError, refetch } = useSources()
  const deleteSource = useDeleteSource()
  const resyncSource = useResyncSource()
  const { toastMessage, toastKey, showToast } = useToast()
  const online = useOnlineStatus()

  const sources = data?.sources ?? []
  const state: ScreenState = isError ? 'error' : isLoading ? 'loading' : sources.length === 0 ? 'empty' : 'ready'
  const ids = [...sources.map((source) => source.id), ADD_ID]

  // `null` = a pessoa ainda não moveu o foco: vale o foco inicial de FR-004,
  // recalculado a cada render — assim ele "chega" sozinho quando as listas
  // terminam de carregar, e nunca briga com um movimento depois (FR-004).
  const [focusedId, setFocusedId] = useState<string | null>(null)
  // `manage` (feature 026, FR-032; botão "Configurações" do canto desde a
  // 037, D-006): alcançada por BAIXO a
  // partir do cartão "Adicionar lista" — nunca a partir de uma lista real
  // (esse BAIXO já abre as ações dela, contrato travado da 023).
  const [row, setRow] = useState<'cards' | 'actions' | 'manage'>('cards')
  const [actionIdx, setActionIdx] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<SourceOut | null>(null)
  const [showExit, setShowExit] = useState(false)
  const [manageTarget, setManageTarget] = useState<'refresh' | 'settings'>('settings')
  const focusNewSource = useCallback((id: string) => { setRow('cards'); setFocusedId(id) }, [])
  const { portalAvailable, refresh, run: updateLists } = useProfilesRefresh(sources, focusNewSource)

  const initialId =
    initialFocusSourceId === ADD_LIST_FOCUS_ID
      ? ADD_ID
      : initialFocusSourceId && sources.some((source) => source.id === initialFocusSourceId)
        ? initialFocusSourceId
        : (sources[0]?.id ?? ADD_ID)
  const effectiveId = focusedId !== null && ids.includes(focusedId) ? focusedId : initialId
  const effectiveRow: 'cards' | 'actions' | 'manage' =
    state === 'ready' && row === 'actions' && effectiveId !== ADD_ID
      ? 'actions'
      : row === 'manage'
        ? 'manage'
        : 'cards'
  const focusedSource = sources.find((source) => source.id === effectiveId)

  // Rolagem horizontal acompanha o foco (FR-012). Sem `scrollIntoView` no jsdom: chamada opcional de propósito.
  const focusedCardRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    focusedCardRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [effectiveId, effectiveRow])

  function runAction(index: number, source: SourceOut) {
    if (index === RESYNC) {
      // Feature 042 (FR-004): ressincronizar precisa de internet — explica, não tenta.
      if (!online) {
        showToast(t('settings.sources.offlineResync'))
        return
      }
      showToast(t('profiles.resyncing'))
      resyncSource.mutate(source.id, {
        onSuccess: (result) => onResyncStarted(result.import_job_id),
      })
    } else if (index === EDIT) {
      onEditSource(source)
    } else if (index === CONFIGURE) {
      onConfigureSource?.(source)
    } else {
      if (deleteSource.isPending) return
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
      onError: () => showToast(t('settings.sources.deleteFailed')),
    })
  }

  useRemoteNav({
    onDirection: (direction: RemoteDirection) => {
      if (state === 'error') return

      if (effectiveRow === 'manage') {
        if (direction === 'up') setRow('cards') // "Adicionar lista" continua em foco (`focusedId` intocado)
        if (direction === 'left' && portalAvailable) setManageTarget('refresh')
        if (direction === 'right') setManageTarget('settings')
        return
      }

      if (effectiveRow === 'actions') {
        // O limite alcança a última ação: senão ela ficaria renderizada e inalcançável pelo controle.
        if (direction === 'up') setRow('cards') // o cartão de onde se desceu (`focusedId`) segue em foco
        // 069: BAIXO na linha de ações chega a "Configurações" (CIMA/RETURN voltam ao cartão).
        if (direction === 'down') setRow('manage')
        if (direction === 'left') setActionIdx((i) => clamp(i - 1, 0, ACTION_KEYS.length - 1))
        if (direction === 'right') setActionIdx((i) => clamp(i + 1, 0, ACTION_KEYS.length - 1))
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
      // "Gerenciar listas" (feature 026, FR-032) — só a partir do cartão
      // "Adicionar lista", nunca de uma lista real (essa já abre as ações
      // dela, contrato travado da 023).
      if (direction === 'down' && effectiveId === ADD_ID) setRow('manage')
    },
    onSelect: () => {
      if (state === 'error') {
        void refetch()
        return
      }
      if (effectiveRow === 'manage') {
        if (manageTarget === 'refresh' && portalAvailable) void updateLists()
        else onManageSources?.()
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
      // RETURN em camadas: "Gerenciar listas"/a linha de ações são camadas
      // abertas dentro da tela.
      if (effectiveRow === 'manage' || effectiveRow === 'actions') {
        setRow('cards')
        return
      }
      if (mode === 'switch') onBack()
      else setShowExit(true)
    },
  })

  // Textos da tabela "Textos" do plan.md da 037 (D-010). Carregando não tem
  // kicker: ainda não se sabe se é primeiro uso ou volta.
  const kicker = state === 'empty' ? t('profiles.kicker.empty') : state === 'ready' ? t('profiles.kicker.ready') : null
  const subtitle =
    state === 'loading'
      ? t('profiles.subtitle.loading')
      : state === 'empty'
        ? t('profiles.subtitle.empty')
        : t('profiles.subtitle.ready')

  return (
    <div className="screen onboarding profiles-screen">
      <OnboardingBrand />
      {state !== 'error' && (
        // Kicker vazio mantém a altura do bloco enquanto carrega — sem pulo de layout.
        <p className="onboarding-kicker" aria-hidden={kicker === null ? 'true' : undefined}>
          {kicker ?? ' '}
        </p>
      )}
      <h1 className="onboarding-title">
        {t('profiles.title.line1')} <br />
        {t('profiles.title.line2')}
      </h1>
      {state !== 'error' && <p className="onboarding-subtitle">{subtitle}</p>}

      {state === 'error' ? (
        <ErrorState
          icon="info"
          title={t('profiles.error.title')}
          description={t('profiles.error.description')}
          code="STO-01"
          actions={[{ label: t('profiles.error.retry'), onSelect: () => void refetch() }]}
          focusedActionIndex={0}
        />
      ) : (
        <div className="source-row" role="group" aria-label={t('profiles.rowLabel')} aria-busy={state === 'loading'}>
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
            const notices = sourceNotices(source, t)
            return (
              <div className="source-card-wrap" key={source.id}>
                {/* Nome acessível = selo + nome + avisos; o avatar é
                    decorativo. O nome é truncado só por CSS, então o texto
                    inteiro continua no nome acessível. Nunca data, endereço
                    nem credencial (FR-006, FR-024). */}
                <button
                  type="button"
                  className={`source-card${isCurrent && effectiveRow === 'cards' && !confirmDelete && !showExit ? ' tv-focus' : ''}${isCurrent ? ' is-current' : ''}`}
                  ref={isCurrent ? focusedCardRef : undefined}
                  onClick={() => onChooseSource(source)}
                >
                  <span className="source-card-kind">{formatType(source, t)}</span>
                  <span
                    className={`source-card-avatar list-avatar--${listAvatarVariant(source.id)}`}
                    aria-hidden="true"
                  >
                    {listInitials(source.display_name)}
                  </span>
                  <span className="source-card-name">{source.display_name}</span>
                  <SourceCardNotices source={source} notices={notices} />
                </button>
                {actionsVisible && (
                  <div className="source-actions" role="group" aria-label={t('profiles.actionsLabel', { name: source.display_name })}>
                    {ACTION_KEYS.map((labelKey, index) => (
                      <Button
                        key={labelKey}
                        variant="secondary"
                        // Com o modal de exclusão aberto, só o `Modal` desenha foco (023, T045: dois anéis ao mesmo tempo).
                        focused={actionIdx === index && !confirmDelete}
                        softDisabled={index === RESYNC && !online}
                        onSelect={() => runAction(index, source)}
                      >
                        {t(labelKey)}
                        {index === RESYNC && !online && <span className="sr-only">{t('settings.sources.offlineNote')}</span>}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="source-card-wrap">
            {/* Cartão-botão (FR-007, D-005): nome acessível exatamente
                "Adicionar lista"; círculo e pílula são decorativos. */}
            <button
              type="button"
              aria-label={t('profiles.add')}
              className={`add-card${effectiveId === ADD_ID && effectiveRow === 'cards' && !showExit ? ' tv-focus' : ''}`}
              ref={effectiveId === ADD_ID ? focusedCardRef : undefined}
              onClick={onAddSource}
            >
              <span className="add-card-circle" aria-hidden="true">
                <Icon name="add" />
              </span>
              <span className="add-card-title" aria-hidden="true">
                {t('profiles.add')}
              </span>
              <span className="add-card-cta" aria-hidden="true">
                {t('profiles.addCta')}
              </span>
            </button>
          </div>
        </div>
      )}

      {state !== 'error' && <p className="profiles-foot-note">{t('profiles.footNote')}</p>}

      {state !== 'error' && portalAvailable && (
        <ProfilesRefreshCorner action={refresh} focused={effectiveRow === 'manage' && manageTarget === 'refresh' && !showExit} onRun={() => void updateLists()} />
      )}

      {state !== 'error' && (
        <button
          type="button"
          className={`profiles-settings-corner${effectiveRow === 'manage' && (manageTarget === 'settings' || !portalAvailable) && !showExit ? ' tv-focus' : ''}`}
          onClick={() => onManageSources?.()}
        >
          <Icon name="settings" />
          {t('settings.title')}
        </button>
      )}

      <Toast message={toastMessage} messageKey={toastKey} />

      {confirmDelete && <DeleteSourceModal source={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={confirmDeletion} />}

      {showExit && <ExitModal onCancel={() => setShowExit(false)} />}
    </div>
  )
}


/**
 * Avisos do cartão (feature 034, FR-006/FR-015): os avisos reais de sempre mais
 * os chips de "há algo a agir" — vence em até 7 dias, expirada, credencial
 * inválida, erro de sincronização ou de EPG — e "Sincronizando" enquanto a
 * execução existe. Componente próprio para assinar o estado por lista. Texto
 * sempre presente, no nome acessível do cartão; nunca data, endereço nem credencial.
 */
export function SourceCardNotices({ source, notices }: { source: SourceOut; notices: string[] }) {
  const t = useT()
  const syncing = useSourceSyncing(source.id)
  // Uma leitura do relógio por montagem do cartão (a tela de perfis remonta ao voltar).
  const [now] = useState(() => Date.now())
  const alerts = sourceAlertChips(source, now, { syncing }, t)
  if (notices.length === 0 && alerts.length === 0) return null
  return (
    <span className="source-card-notices">
      {notices.map((notice) => (
        <span className="source-card-badge" key={notice}>
          {notice}
        </span>
      ))}
      {alerts.map((alert) => (
        <span className={`source-card-badge source-card-badge--${alert.tone}`} key={alert.label}>
          {alert.label}
        </span>
      ))}
    </span>
  )
}
