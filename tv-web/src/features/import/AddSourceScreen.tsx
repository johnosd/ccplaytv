import { useRef, useState } from 'react'
import { useCreateSource, useUpdateSource, type SourceOut } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface AddSourceScreenProps {
  /** Presente = tela em modo edição de uma fonte já existente. */
  existingSource?: SourceOut
  onSourceCreated: (result: { sourceId: string; jobId: string }) => void
  onSourceUpdated?: () => void
  onBack: () => void
}

type EntryMode = 'url' | 'provider'

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

  return (
    <section className="screen" aria-labelledby="add-source-title" ref={containerRef}>
      <h1 id="add-source-title" className="screen-title" style={{ marginBottom: 44 }}>
        {isEditing ? 'Editar lista' : 'Adicionar lista'}
      </h1>

      {!isEditing && (
        <div className="tabs-row" role="tablist" aria-label="Forma de entrada">
          <button
            type="button"
            role="tab"
            className="tab-pill"
            aria-selected={mode === 'url'}
            onClick={() => setMode('url')}
          >
            URL da lista M3U
          </button>
          <button
            type="button"
            role="tab"
            className="tab-pill"
            aria-selected={mode === 'provider'}
            onClick={() => setMode('provider')}
          >
            Endereço, usuário e senha
          </button>
        </div>
      )}

      <div className="field-group">
        <label>
          <span className="field-label">Nome de exibição</span>
          <input
            className="field-box"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        {mode === 'url' ? (
          <label>
            <span className="field-label">URL da lista M3U</span>
            <input
              className="field-box"
              value={m3uUrl}
              onChange={(event) => setM3uUrl(event.target.value)}
              placeholder={isEditing ? 'Deixe em branco para manter a URL atual' : undefined}
            />
          </label>
        ) : (
          <>
            <label>
              <span className="field-label">Endereço do servidor (DNS do provedor)</span>
              <input
                className="field-box"
                value={dns}
                onChange={(event) => setDns(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Usuário</span>
              <input
                className="field-box"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={isEditing ? 'Deixe em branco para manter o usuário atual' : undefined}
              />
            </label>
            <label>
              <span className="field-label">Senha</span>
              <input
                className="field-box"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isEditing ? 'Deixe em branco para manter a senha atual' : undefined}
              />
            </label>
          </>
        )}

        {validationError && (
          <p className="form-error" role="alert">
            {validationError}
          </p>
        )}
        {createSource.isError && (
          <p className="form-error" role="alert">
            Não foi possível adicionar a fonte: {createSource.error.message}
          </p>
        )}
        {updateSource.isError && (
          <p className="form-error" role="alert">
            Não foi possível salvar as alterações: {updateSource.error.message}
          </p>
        )}

        <button className="submit-button" type="button" onClick={handleSubmit} disabled={isPending}>
          {isEditing
            ? updateSource.isPending
              ? 'Salvando…'
              : 'Salvar alterações'
            : createSource.isPending
              ? 'Adicionando…'
              : 'Adicionar lista'}
        </button>
      </div>
    </section>
  )
}
