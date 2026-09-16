import { useRef, useState, type FormEvent } from 'react'
import { useCreateSource } from './importApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface AddSourceScreenProps {
  onSourceCreated: (result: { sourceId: string; jobId: string }) => void
  onBack: () => void
}

type EntryMode = 'url' | 'provider'

export function AddSourceScreen({ onSourceCreated, onBack }: AddSourceScreenProps) {
  const containerRef = useRef<HTMLElement>(null)
  useTvKeyNav(containerRef)
  useRemoteNav({ onBack })

  const [mode, setMode] = useState<EntryMode>('url')
  const [displayName, setDisplayName] = useState('')
  const [m3uUrl, setM3uUrl] = useState('')
  const [dns, setDns] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const createSource = useCreateSource()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError(null)

    if (!displayName.trim()) {
      setValidationError('Informe um nome de exibição para a fonte.')
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
        Adicionar lista
      </h1>

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

      <form className="field-group" onSubmit={handleSubmit}>
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
            />
          </label>
        ) : (
          <>
            <label>
              <span className="field-label">Endereço do servidor (DNS do provedor)</span>
              <input className="field-box" value={dns} onChange={(event) => setDns(event.target.value)} />
            </label>
            <label>
              <span className="field-label">Usuário</span>
              <input
                className="field-box"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Senha</span>
              <input
                className="field-box"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

        <button className="submit-button" type="submit" disabled={createSource.isPending}>
          {createSource.isPending ? 'Adicionando…' : 'Adicionar lista'}
        </button>
      </form>
    </section>
  )
}
