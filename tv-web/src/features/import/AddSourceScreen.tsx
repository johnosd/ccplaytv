import { useRef, useState } from 'react'
import { useCreateSource, useUpdateSource, type SourceOut } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { Button } from '../../components/Button'
import { ComingSoon } from '../../components/ComingSoon'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import { OnboardingBrand } from './OnboardingBrand'

export interface AddSourceScreenProps {
  /** Presente = tela em modo edição de uma fonte já existente. */
  existingSource?: SourceOut
  onSourceCreated: (result: { sourceId: string; jobId: string }) => void
  onSourceUpdated?: () => void
  onBack: () => void
}

type EntryMode = 'url' | 'provider'

const ENTRY_TABS: { id: EntryMode; label: string }[] = [
  { id: 'url', label: 'URL da lista M3U' },
  { id: 'provider', label: 'Endereço, usuário e senha' },
]

/**
 * Onboarding de lista no visual V14 (feature 023, US4/FR-034..FR-036): o
 * formulário real M3U/Xtream (mesma validação e mesmos erros de sempre) com os
 * campos da feature 022 (`TextField`, rótulo permanente e IME por finalidade) e
 * um cartão "Conectar pelo celular" que é só mock "Em breve" (FR-035) — o
 * formulário manual continua sendo o caminho real, nunca o celular.
 *
 * Foco: roving DOM (`useTvKeyNav`) sobre `<button>`/`<input>` reais, como
 * sempre foi aqui — o `Button`/`Tabs`/`ComingSoon` da 022 são `<button>`
 * nativos e entram no percurso sem nada extra.
 */
export function AddSourceScreen({
  existingSource,
  onSourceCreated,
  onSourceUpdated,
  onBack,
}: AddSourceScreenProps) {
  const containerRef = useRef<HTMLElement>(null)
  useTvKeyNav(containerRef)
  useRemoteNav({ onBack })

  const isEditing = existingSource != null
  const [mode, setMode] = useState<EntryMode>(existingSource?.type === 'provider_credentials' ? 'provider' : 'url')
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
  const isPending = createSource.isPending || updateSource.isPending

  // Sem <form>: salvar só acontece no clique/OK deste botão especificamente,
  // nunca implicitamente. Um <form> com <input> dentro submete sozinho no
  // Enter de QUALQUER campo — inclusive o "Concluído"/"Done" do teclado
  // remoto do celular pareado, que fecha o campo de um jeito que não passa
  // pelo mesmo keydown que um controle físico dispara. Sem <form>, esse
  // mecanismo do navegador nem existe: nada aciona handleSubmit a não ser
  // este onClick.
  function handleSubmit() {
    setValidationError(null)

    if (!displayName.trim()) {
      setValidationError('Informe um nome de exibição para a fonte.')
      return
    }

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
        { onSuccess: () => onSourceUpdated?.() },
      )
      return
    }

    if (mode === 'url') {
      if (!m3uUrl.trim()) {
        setValidationError('Informe a URL da lista M3U.')
        return
      }
      createSource.mutate(
        { type: 'm3u_url', display_name: displayName, m3u_url: m3uUrl },
        {
          onSuccess: (result) =>
            onSourceCreated({ sourceId: result.source_id, jobId: result.import_job_id }),
        },
      )
      return
    }

    if (!dns.trim() || !username.trim() || !password.trim()) {
      setValidationError('Informe endereço do servidor, usuário e senha.')
      return
    }
    createSource.mutate(
      {
        type: 'provider_credentials',
        display_name: displayName,
        provider: { dns, username, password },
      },
      {
        onSuccess: (result) =>
          onSourceCreated({ sourceId: result.source_id, jobId: result.import_job_id }),
      },
    )
  }

  const submitLabel = isEditing
    ? updateSource.isPending
      ? 'Salvando…'
      : 'Salvar alterações'
    : createSource.isPending
      ? 'Adicionando…'
      : 'Adicionar lista'

  return (
    <section className="screen onboarding" aria-labelledby="add-source-title" ref={containerRef}>
      <OnboardingBrand />
      <p className="onboarding-kicker">{isEditing ? 'Suas listas' : 'Configuração inicial'}</p>
      <h1 id="add-source-title" className="onboarding-title">
        {isEditing ? 'Editar lista' : 'Adicionar lista'}
      </h1>
      <p className="onboarding-subtitle">
        {isEditing
          ? 'Altere o que precisar. Usuário e senha em branco continuam como estão.'
          : 'Preencha os dados da sua lista M3U ou Xtream para começar.'}
      </p>

      <div className="onboarding-layout">
        <div className="onboarding-form">
          {/* O `Tabs` da 022 não tem nome próprio — o grupo preserva o rótulo
              "Forma de entrada" que a lista de abas sempre teve. */}
          {!isEditing && (
            <div role="group" aria-label="Forma de entrada" className="onboarding-tabs">
              <Tabs items={ENTRY_TABS} activeId={mode} onSelect={(id) => setMode(id as EntryMode)} />
            </div>
          )}

          <div className="onboarding-fields">
            <TextField label="Nome de exibição" purpose="text" value={displayName} onChange={setDisplayName} />

            {mode === 'url' ? (
              <TextField
                label="URL da lista M3U"
                purpose="url"
                value={m3uUrl}
                onChange={setM3uUrl}
                hint={isEditing ? 'Deixe em branco para manter a URL atual' : undefined}
              />
            ) : (
              <>
                <TextField
                  label="Endereço do servidor (DNS do provedor)"
                  purpose="url"
                  value={dns}
                  onChange={setDns}
                />
                <TextField
                  label="Usuário"
                  purpose="username"
                  value={username}
                  onChange={setUsername}
                  hint={isEditing ? 'Deixe em branco para manter o usuário atual' : undefined}
                />
                <TextField
                  label="Senha"
                  purpose="password"
                  value={password}
                  onChange={setPassword}
                  hint={isEditing ? 'Deixe em branco para manter a senha atual' : undefined}
                />
              </>
            )}
          </div>

          {validationError && (
            <p className="form-error onboarding-error" role="alert">
              {validationError}
            </p>
          )}
          {createSource.isError && (
            <p className="form-error onboarding-error" role="alert">
              Não foi possível adicionar a fonte: {createSource.error.message}
            </p>
          )}
          {updateSource.isError && (
            <p className="form-error onboarding-error" role="alert">
              Não foi possível salvar as alterações: {updateSource.error.message}
            </p>
          )}

          {/* `loading` em vez de `disabled`: durante o envio o botão continua
              focável (constitution, "Foco Visível e Sem Becos Sem Saída") e só
              ignora um segundo OK, sem submissão duplicada. */}
          <div className="onboarding-submit">
            <Button variant="accent" loading={isPending} onSelect={handleSubmit}>
              {submitLabel}
            </Button>
          </div>
        </div>

        {!isEditing && (
          <aside className="onboarding-side" aria-labelledby="pair-phone-title">
            <h2 id="pair-phone-title" className="onboarding-side-title">
              Conectar pelo celular
            </h2>
            <p className="onboarding-side-text">
              Ainda não está disponível. Por enquanto, preencha os dados ao lado.
            </p>
            <ComingSoon id="pair-phone" />
          </aside>
        )}
      </div>
    </section>
  )
}
