import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCreateSource, useUpdateSource, type SourceOut } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useImeChain } from '../../lib/useImeChain'
import { Button } from '../../components/Button'
import { OnboardingBrand } from './OnboardingBrand'
import { checkSourceConnection } from '../../lib/catalog/sourceConnectionCheck'
import { isQuotaError, StorageFullError } from '../../lib/catalog/catalogRepository'
import { bannerFor, RETRY_LABEL_KEY, type ConnectionBanner } from './connectionBanner'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { ConnectionErrorBanner } from './ConnectionErrorBanner'
import { connectionInputFor } from './connectionInput'
import { SourceFormFields, type SourceFormValues } from './SourceFormFields'
import { useStoredSourceFields } from './useStoredSourceFields'

/** `idle` → `checking` (confirma a conexão, cancelável) → `saving` (grava a lista). */
type SubmitPhase = 'idle' | 'checking' | 'saving'

export interface AddSourceScreenProps {
  /** Presente = tela em modo edição de uma fonte já existente. */
  existingSource?: SourceOut
  onSourceCreated: (result: { sourceId: string; jobId: string }) => void
  onSourceUpdated?: () => void
  onBack: () => void
  /**
   * Coluna "Pelo celular" (feature 070, D-008): montada pelo App (features/portal), nunca importada aqui.
   * Presente = substitui o antigo mock "Em breve" e traz o próprio Voltar; ausente = só o cadastro manual.
   */
  phonePanel?: ReactNode
}

type EntryMode = 'url' | 'provider'

/** Os dois tipos do painel "Configuração manual" (D-008), na ordem do protótipo. */
const ENTRY_TYPES: { id: EntryMode; title: string | MessageKey }[] = [
  { id: 'provider', title: 'Xtream Codes' },
  { id: 'url', title: 'add.type.m3u' },
]

/**
 * Cadastro e edição de lista "Conecte sua lista IPTV" (feature 023, redesenhado
 * na feature 037 no formato do `sourceSetup()` do protótipo V13.2): painel
 * lateral "Como funciona" e painel principal "Adicionar serviço" com o celular
 * como mock "Em breve" (FR-013 — sem QR, código ou endereço inventados), a
 * escolha Xtream Codes / Lista M3U (Xtream por padrão), os campos do tipo e as
 * ações. Mesma validação, mesmos erros e mesmo `mutate` de sempre (FR-018).
 * A edição (D-015) mostra só o painel manual, sem celular, sem "Como funciona"
 * e sem trocar o tipo.
 *
 * Foco: roving DOM (`useTvKeyNav`) sobre `<button>`/`<input>` reais, como
 * sempre foi aqui. A ordem do DOM segue a ordem visual (celular → tipos →
 * campos → ações); no cadastro, o foco inicial vai ao tipo selecionado por
 * `initialFocus` (D-009). RETURN sai da tela de qualquer ponto
 * (`useRemoteNav`), como antes.
 */
export function AddSourceScreen({
  existingSource,
  onSourceCreated,
  onSourceUpdated,
  onBack,
  phonePanel,
}: AddSourceScreenProps) {
  const t = useT()
  const isEditing = existingSource != null
  const containerRef = useRef<HTMLElement>(null)
  const selectedTypeRef = useRef<HTMLButtonElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  useTvKeyNav(containerRef, isEditing ? {} : { initialFocus: () => selectedTypeRef.current })
  // Done do IME leva o foco à ação principal, sem enviar (feature 045, US2).
  useImeChain(containerRef, submitRef)

  // Trava **síncrona** (feature 045, D-007): `phase` só muda no render seguinte, e
  // dois OK seguidos passariam. `abortRef` só existe enquanto a conexão é confirmada.
  const lockRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<SubmitPhase>('idle')
  const [banner, setBanner] = useState<ConnectionBanner | null>(null)

  // RETURN fecha primeiro a camada aberta: com a confirmação em andamento só a
  // cancela (dados preservados, foco na ação); sem ela, sai da tela (FR-009).
  function handleBack() {
    if (abortRef.current) {
      abortRef.current.abort()
      return
    }
    onBack()
  }
  useRemoteNav({ onBack: handleBack })

  // Sair da tela no meio da confirmação não deixa a requisição pendurada.
  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const [mode, setMode] = useState<EntryMode>(
    existingSource == null || existingSource.type === 'provider_credentials' ? 'provider' : 'url',
  )
  const [displayName, setDisplayName] = useState(existingSource?.display_name ?? '')
  const [m3uUrl, setM3uUrl] = useState('')
  // Em edição (feature 070, FR-011), os valores salvos no próprio aparelho entram nos campos, visíveis
  // (olho do formulário). Até a leitura local chegar — ou se ela falhar — o campo fica em branco e
  // em branco continua significando "manter o valor atual".
  const [dns, setDns] = useState(existingSource?.provider_dns ?? '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const stored = useStoredSourceFields(existingSource?.id)
  const [appliedStored, setAppliedStored] = useState(stored)
  if (stored !== appliedStored) {
    // Ajuste de estado na renderização (padrão do React para estado derivado de uma leitura que
    // chega depois): só preenche o que a pessoa ainda não digitou.
    setAppliedStored(stored)
    if (stored) {
      setM3uUrl((current) => current || stored.m3uUrl)
      setDns((current) => current || stored.dns)
      setUsername((current) => current || stored.username)
      setPassword((current) => current || stored.password)
    }
  }
  const [validationError, setValidationError] = useState<string | null>(null)

  const createSource = useCreateSource()
  const updateSource = useUpdateSource()

  /** Devolve a tela ao repouso e o foco à ação principal (nunca uma tela sem foco, SC-003). */
  function settle(next: ConnectionBanner | null) {
    abortRef.current = null
    lockRef.current = false
    setPhase('idle')
    setBanner(next)
    submitRef.current?.focus()
  }

  /** Falha ao gravar: disco cheio tem código próprio; o resto mantém a linha genérica de sempre. */
  function settleSaveError(error: unknown) {
    settle(isQuotaError(error) || error instanceof StorageFullError ? bannerFor('STO-01', t) : null)
  }

  // Sem <form>: salvar só acontece no clique/OK deste botão especificamente,
  // nunca implicitamente. Um <form> com <input> dentro submete sozinho no
  // Enter de QUALQUER campo — inclusive o "Concluído"/"Done" do teclado
  // remoto do celular pareado, que fecha o campo de um jeito que não passa
  // pelo mesmo keydown que um controle físico dispara. Sem <form>, esse
  // mecanismo do navegador nem existe: nada aciona handleSubmit a não ser
  // este onClick.
  async function handleSubmit() {
    if (lockRef.current) return
    setValidationError(null)

    if (!displayName.trim()) {
      setBanner(null)
      setValidationError(t('add.err.name'))
      return
    }
    if (!isEditing) {
      if (mode === 'url' && !m3uUrl.trim()) {
        setBanner(null)
        setValidationError(t('add.err.m3u'))
        return
      }
      if (mode === 'provider' && (!dns.trim() || !username.trim() || !password.trim())) {
        setBanner(null)
        setValidationError(t('add.err.provider'))
        return
      }
    }

    // Confirma a conexão ANTES de criar/atualizar (feature 045, D-001): uma falha
    // não deixa fonte órfã e a pessoa continua aqui, com os dados preenchidos.
    lockRef.current = true
    setBanner(null)
    setPhase('checking')
    const controller = new AbortController()
    abortRef.current = controller

    // Valor igual ao salvo = "não mudou": segue o caminho de sempre do campo em branco (sem nova
    // confirmação de conexão e sem regravar o segredo).
    const keep = (value: string, saved: string | undefined) => (isEditing && saved !== undefined && value === saved ? '' : value)
    const sendM3u = keep(m3uUrl, stored?.m3uUrl)
    const sendUser = keep(username, stored?.username)
    const sendPassword = keep(password, stored?.password)

    try {
      const input = await connectionInputFor(
        { mode, m3uUrl: sendM3u, dns, username: sendUser, password: sendPassword },
        existingSource ? { id: existingSource.id, providerDns: existingSource.provider_dns } : undefined,
      )
      if (input) {
        const result = await checkSourceConnection(input, { signal: controller.signal })
        if (result.status === 'cancelled') return settle(null)
        if (result.status === 'failed') return settle(bannerFor(result.code, t))
      }
    } catch {
      // Defeito nosso não vira "falha de rede" (D-009): cai na linha genérica, sem a mensagem crua.
      settle(null)
      setValidationError(
        isEditing ? t('add.err.saveEdit') : t('add.err.saveNew'),
      )
      return
    }
    if (controller.signal.aborted) return settle(null)

    abortRef.current = null
    setPhase('saving')

    if (isEditing) {
      updateSource.mutate(
        {
          sourceId: existingSource.id,
          input: {
            display_name: displayName,
            ...(mode === 'url' ? { m3u_url: sendM3u || undefined } : {}),
            ...(mode === 'provider'
              ? { provider: { dns: dns || undefined, username: sendUser || undefined, password: sendPassword || undefined } }
              : {}),
          },
        },
        { onSuccess: () => onSourceUpdated?.(), onError: settleSaveError },
      )
      return
    }

    const onSuccess = (result: { source_id: string; import_job_id: string }) =>
      onSourceCreated({ sourceId: result.source_id, jobId: result.import_job_id })

    if (mode === 'url') {
      createSource.mutate(
        { type: 'm3u_url', display_name: displayName, m3u_url: m3uUrl },
        { onSuccess, onError: settleSaveError },
      )
      return
    }
    createSource.mutate(
      {
        type: 'provider_credentials',
        display_name: displayName,
        provider: { dns, username, password },
      },
      { onSuccess, onError: settleSaveError },
    )
  }

  const submitLabel =
    phase === 'saving' && isEditing
      ? t('add.submit.saving')
      : phase !== 'idle'
        ? t('add.submit.connecting')
        : banner?.retryable
          ? t(RETRY_LABEL_KEY)
          : isEditing
            ? t('add.submit.save')
            : t('add.submit.connect')

  const setters: Record<keyof SourceFormValues, (value: string) => void> = {
    displayName: setDisplayName, m3uUrl: setM3uUrl, dns: setDns, username: setUsername, password: setPassword,
  }
  const fields = (
    <SourceFormFields mode={mode} isEditing={isEditing} values={{ displayName, m3uUrl, dns, username, password }}
      onChange={(field, value) => setters[field](value)} />
  )

  const feedbackAndActions = (
    <>
      {validationError && (
        <p className="form-error onboarding-error" role="alert">
          {validationError}
        </p>
      )}
      {banner && <ConnectionErrorBanner banner={banner} />}
      {!banner && !validationError && createSource.isError && (
        <p className="form-error onboarding-error" role="alert">
          {t('add.err.saveNewWith', { message: createSource.error.message })}
        </p>
      )}
      {!banner && !validationError && updateSource.isError && (
        <p className="form-error onboarding-error" role="alert">
          {t('add.err.saveEditWith', { message: updateSource.error.message })}
        </p>
      )}

      {/* `loading` em vez de `disabled`: durante o envio o botão continua
          focável (constitution, "Foco Visível e Sem Becos Sem Saída") e só
          ignora um segundo OK, sem submissão duplicada. */}
      <div className="source-setup-actions">
        {/* Com o painel do celular, o Voltar é o dele (um só Voltar na tela, A002). */}
        {!phonePanel && (
          <Button variant="secondary" onSelect={onBack}>
            {t('common.back')}
          </Button>
        )}
        <Button variant="accent" loading={phase !== 'idle'} onSelect={handleSubmit} buttonRef={submitRef}>
          {submitLabel}
        </Button>
      </div>
    </>
  )

  const currentType = ENTRY_TYPES.find((type) => type.id === mode)!
  /** Xtream Codes é nome próprio (literal); o outro título vem do catálogo. */
  const typeTitle = (title: string): string => (title.startsWith('add.') ? t(title as MessageKey) : title)

  return (
    <section
      className="screen onboarding source-setup no-scrollbar form-scroll-room"
      aria-labelledby="add-source-title"
      ref={containerRef}
    >
      <OnboardingBrand />
      <p className="onboarding-kicker">{isEditing ? t('add.kicker.edit') : t('add.kicker.new')}</p>
      <h1 id="add-source-title" className="onboarding-title">
        {isEditing ? t('add.title.edit') : t('add.title.new')}
      </h1>
      <p className="onboarding-subtitle">
        {isEditing ? t('add.subtitle.edit') : t('add.subtitle.new')}
      </p>

      {isEditing ? (
        <div className="source-setup-layout source-setup-layout--edit">
          <div className="source-setup-main">
            <p className="source-setup-eyebrow">{typeTitle(currentType.title)}</p>
            <h2 className="source-setup-main-title">{t('add.manual')}</h2>
            {fields}
            {feedbackAndActions}
          </div>
        </div>
      ) : (
        <div className={`source-setup-layout${phonePanel ? ' source-setup-layout--pairing' : ' source-setup-layout--edit'}`}>
          {/* Coluna "Pelo celular" real (070); sem ela, só o cadastro manual — nunca um mock com dado inventado. */}
          {phonePanel && <aside className="source-setup-side source-setup-phone">{phonePanel}</aside>}

          <div className="source-setup-main">
            <section className="source-setup-manual" aria-labelledby="manual-setup-title">
              <h2 id="manual-setup-title" className="source-setup-main-title">
                {t('add.manual')}
              </h2>
              {/* Seletor de duas posições, igual ao do portal: botões reais (foco do controle), o
                  selecionado com destaque E a marca ✓ — nunca só a cor (FR-015). */}
              <div className="source-type-row" role="group" aria-label={t('add.typeGroup')}>
                {ENTRY_TYPES.map((type) => {
                  const selected = type.id === mode
                  return (
                    <button
                      key={type.id}
                      ref={selected ? selectedTypeRef : undefined}
                      type="button"
                      className={`source-type${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => setMode(type.id)}
                    >
                      {selected && (
                        <span className="source-type-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      {typeTitle(type.title)}
                    </button>
                  )
                })}
              </div>
            </section>

            {fields}
            {feedbackAndActions}
          </div>
        </div>
      )}
    </section>
  )
}
