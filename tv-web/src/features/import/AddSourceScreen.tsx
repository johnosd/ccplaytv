import { useEffect, useRef, useState } from 'react'
import { useCreateSource, useUpdateSource, type SourceOut } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useImeChain } from '../../lib/useImeChain'
import { Button } from '../../components/Button'
import { ComingSoon } from '../../components/ComingSoon'
import { TextField } from '../../components/TextField'
import { OnboardingBrand } from './OnboardingBrand'
import { checkSourceConnection } from '../../lib/catalog/sourceConnectionCheck'
import { isQuotaError, StorageFullError } from '../../lib/catalog/catalogRepository'
import { bannerFor, RETRY_LABEL, type ConnectionBanner } from './connectionBanner'
import { ConnectionErrorBanner } from './ConnectionErrorBanner'
import { connectionInputFor } from './connectionInput'

/** `idle` → `checking` (confirma a conexão, cancelável) → `saving` (grava a lista). */
type SubmitPhase = 'idle' | 'checking' | 'saving'

export interface AddSourceScreenProps {
  /** Presente = tela em modo edição de uma fonte já existente. */
  existingSource?: SourceOut
  onSourceCreated: (result: { sourceId: string; jobId: string }) => void
  onSourceUpdated?: () => void
  onBack: () => void
}

type EntryMode = 'url' | 'provider'

/** Os dois tipos do painel "Configuração manual" (D-008), na ordem do protótipo. */
const ENTRY_TYPES: { id: EntryMode; title: string; description: string }[] = [
  { id: 'provider', title: 'Xtream Codes', description: 'Servidor, usuário e senha com categorias e EPG.' },
  { id: 'url', title: 'Lista M3U', description: 'URL única para playlist rápida e compatível.' },
]

/** Passos de "Como funciona" — o caminho real, sem o celular (FR-014). Nenhum é marcado como concluído. */
const HOW_IT_WORKS: { title: string; text: string }[] = [
  { title: 'Escolha o tipo', text: 'Xtream Codes ou Lista M3U' },
  { title: 'Digite os dados', text: 'Servidor e login, ou a URL da lista' },
  { title: 'Sincronizar tudo', text: 'Canais, EPG, filmes e séries chegam na TV' },
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
}: AddSourceScreenProps) {
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
  // Em edição, endereço vem preenchido (não é segredo sozinho); usuário e
  // senha começam em branco e ficam com o valor atual se não forem
  // reescritos (write-only — o backend nunca devolve os dois).
  const [dns, setDns] = useState(existingSource?.provider_dns ?? '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
    settle(isQuotaError(error) || error instanceof StorageFullError ? bannerFor('STO-01') : null)
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
      setValidationError('Informe um nome para a lista.')
      return
    }
    if (!isEditing) {
      if (mode === 'url' && !m3uUrl.trim()) {
        setBanner(null)
        setValidationError('Informe a URL da lista M3U.')
        return
      }
      if (mode === 'provider' && (!dns.trim() || !username.trim() || !password.trim())) {
        setBanner(null)
        setValidationError('Informe endereço do servidor, usuário e senha.')
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

    try {
      const input = await connectionInputFor(
        { mode, m3uUrl, dns, username, password },
        existingSource ? { id: existingSource.id, providerDns: existingSource.provider_dns } : undefined,
      )
      if (input) {
        const result = await checkSourceConnection(input, { signal: controller.signal })
        if (result.status === 'cancelled') return settle(null)
        if (result.status === 'failed') return settle(bannerFor(result.code))
      }
    } catch {
      // Defeito nosso não vira "falha de rede" (D-009): cai na linha genérica, sem a mensagem crua.
      settle(null)
      setValidationError(
        isEditing ? 'Não foi possível salvar as alterações.' : 'Não foi possível adicionar a fonte.',
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
            ...(mode === 'url' ? { m3u_url: m3uUrl || undefined } : {}),
            ...(mode === 'provider'
              ? { provider: { dns: dns || undefined, username: username || undefined, password: password || undefined } }
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
      ? 'Salvando…'
      : phase !== 'idle'
        ? 'Conectando…'
        : banner?.retryable
          ? RETRY_LABEL
          : isEditing
            ? 'Salvar alterações'
            : 'Conectar e sincronizar'

  const fields = (
    <div className="source-setup-fields">
      <div className="source-setup-field--wide">
        <TextField label="Nome da lista" purpose="text" enterKeyHint="next" value={displayName} onChange={setDisplayName} />
      </div>
      {mode === 'url' ? (
        <div className="source-setup-field--wide">
          <TextField
            label="URL M3U"
            purpose="url"
            enterKeyHint="done"
            value={m3uUrl}
            onChange={setM3uUrl}
            hint={isEditing ? 'Deixe em branco para manter a URL atual' : undefined}
          />
        </div>
      ) : (
        <>
          <div className="source-setup-field--wide">
            <TextField label="Servidor" purpose="url" enterKeyHint="next" value={dns} onChange={setDns} />
          </div>
          <TextField
            label="Usuário"
            purpose="username"
            enterKeyHint="next"
            value={username}
            onChange={setUsername}
            hint={isEditing ? 'Deixe em branco para manter o usuário atual' : undefined}
          />
          <TextField
            label="Senha"
            purpose="password"
            revealable
            revealNoun="senha"
            enterKeyHint="done"
            value={password}
            onChange={setPassword}
            hint={isEditing ? 'Deixe em branco para manter a senha atual' : undefined}
          />
        </>
      )}
    </div>
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
          Não foi possível adicionar a fonte: {createSource.error.message}
        </p>
      )}
      {!banner && !validationError && updateSource.isError && (
        <p className="form-error onboarding-error" role="alert">
          Não foi possível salvar as alterações: {updateSource.error.message}
        </p>
      )}

      {/* `loading` em vez de `disabled`: durante o envio o botão continua
          focável (constitution, "Foco Visível e Sem Becos Sem Saída") e só
          ignora um segundo OK, sem submissão duplicada. */}
      <div className="source-setup-actions">
        <Button variant="secondary" onSelect={onBack}>
          Voltar
        </Button>
        <Button variant="accent" loading={phase !== 'idle'} onSelect={handleSubmit} buttonRef={submitRef}>
          {submitLabel}
        </Button>
      </div>
    </>
  )

  const currentType = ENTRY_TYPES.find((type) => type.id === mode)!

  return (
    <section
      className="screen onboarding source-setup no-scrollbar form-scroll-room"
      aria-labelledby="add-source-title"
      ref={containerRef}
    >
      <OnboardingBrand />
      <p className="onboarding-kicker">{isEditing ? 'Suas listas' : 'Configuração inicial'}</p>
      <h1 id="add-source-title" className="onboarding-title">
        {isEditing ? 'Editar lista' : 'Conecte sua lista IPTV'}
      </h1>
      <p className="onboarding-subtitle">
        {isEditing
          ? 'Altere o que precisar. Usuário e senha em branco continuam como estão.'
          : 'Escolha Xtream Codes ou Lista M3U e preencha os dados da sua lista. Conectar pelo celular chega em breve.'}
      </p>

      {isEditing ? (
        <div className="source-setup-layout source-setup-layout--edit">
          <div className="source-setup-main">
            <p className="source-setup-eyebrow">{currentType.title}</p>
            <h2 className="source-setup-main-title">Configuração manual</h2>
            {fields}
            {feedbackAndActions}
          </div>
        </div>
      ) : (
        <div className="source-setup-layout">
          <aside className="source-setup-side" aria-labelledby="setup-how-title">
            <h2 id="setup-how-title" className="source-setup-side-title">
              Como funciona
            </h2>
            <ol className="source-setup-steps">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step.title} className="source-setup-step">
                  <span className="source-setup-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="source-setup-step-copy">
                    <b>{step.title}</b>
                    <span>{step.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="source-setup-note">Em breve: conectar pelo celular, sem digitar no controle remoto.</p>
          </aside>

          <div className="source-setup-main">
            <h2 className="source-setup-main-title">Adicionar serviço</h2>
            <p className="source-setup-main-text">
              Preencha na TV com o controle remoto — o teclado da TV abre em cada campo.
            </p>

            <div className="source-setup-methods">
              <section className="source-setup-panel source-setup-pair" aria-labelledby="pair-phone-title">
                <p className="source-setup-eyebrow">Em breve</p>
                <h3 id="pair-phone-title" className="source-setup-panel-title">
                  Conectar com celular
                </h3>
                <p className="source-setup-panel-text">
                  Parear a TV com o celular por QR code, para não digitar URLs longas no controle.
                </p>
                <ComingSoon id="pair-phone" />
              </section>

              <section className="source-setup-panel source-setup-manual" aria-labelledby="manual-setup-title">
                <p className="source-setup-eyebrow">Disponível agora</p>
                <h3 id="manual-setup-title" className="source-setup-panel-title">
                  Configuração manual
                </h3>
                <div className="source-type-row" role="group" aria-label="Tipo de lista">
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
                        <span className="source-type-head">
                          <b>{type.title}</b>
                          {/* Marca visível além da cor (FR-015); o estado lido é o `aria-pressed`. */}
                          {selected && (
                            <span className="source-type-check" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </span>
                        <span className="source-type-text">{type.description}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>

            {fields}
            {feedbackAndActions}
          </div>
        </div>
      )}
    </section>
  )
}
