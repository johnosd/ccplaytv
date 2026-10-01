import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSaveTmdbKey } from '../catalog/catalogApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import type { SaveTmdbKeyFailure } from '../../lib/metadata/types'

export interface TmdbKeyScreenProps {
  /** Chave aceita pelo TMDB e gravada — quem abriu a tela volta a Configurações. */
  onSaved: () => void
  onBack: () => void
}

/** Motivo → mensagem para quem digitou. Nunca ecoa o que foi digitado (FR-013). */
const FAILURE_MESSAGE: Record<SaveTmdbKeyFailure, string> = {
  invalid_format: 'Formato inválido. Use a chave da API (32 caracteres) ou o token de leitura (começa com "eyJ").',
  refused: 'O TMDB recusou esta chave. Confira se copiou inteira, sem espaços.',
  offline: 'Não foi possível falar com o TMDB agora. Verifique a conexão e tente de novo.',
  rate_limited: 'O TMDB pediu para aguardar. Tente de novo em alguns minutos.',
}

/**
 * Tela da chave TMDB (feature 032, US2, `logic/integracoes-e-dock.md` §2).
 * Foco DOM real (`useTvKeyNav`) e IME da TV, no molde de `EpgSettingsScreen`.
 *
 * **O campo começa sempre vazio** — a chave guardada nunca volta para a tela
 * (nem para "Editar"): quem edita digita a nova. "Mostrar" só alterna a
 * máscara do que a própria pessoa acabou de digitar. Uma chave recusada nunca
 * é gravada; o foco volta ao campo.
 */
export function TmdbKeyScreen({ onSaved, onBack }: TmdbKeyScreenProps): ReactNode {
  const containerRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useTvKeyNav(containerRef)
  useRemoteNav({ onBack })

  const [draft, setDraft] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const save = useSaveTmdbKey()

  // Trava síncrona: `save.isPending` só vira `true` no render seguinte, e dois
  // OK em sequência rápida (tecla repetida do controle) passariam pelos dois.
  const submitting = useRef(false)

  function submit() {
    // Sem submissão duplicada: um segundo OK durante o teste é ignorado.
    if (submitting.current) return
    submitting.current = true
    save.mutate(draft, {
      onSettled: () => {
        submitting.current = false
      },
      onSuccess: (result) => {
        if (result.ok) {
          onSaved()
          return
        }
        setError(FAILURE_MESSAGE[result.reason])
        inputRef.current?.focus()
      },
      onError: () => {
        setError(FAILURE_MESSAGE.offline)
        inputRef.current?.focus()
      },
    })
  }

  return (
    <section className="screen epg-settings tmdb-key" ref={containerRef} aria-labelledby="tmdb-key-title">
      <h1 id="tmdb-key-title" className="screen-title">
        Chave do TMDB
      </h1>
      <p className="epg-settings-note">
        Crie a sua chave em themoviedb.org, em Configurações › API. A chave fica só neste aparelho e só é enviada ao TMDB.
      </p>

      <div className="epg-settings-field">
        <TextField
          label="Chave da API (v3) ou token de leitura (v4)"
          purpose={showKey ? 'text' : 'password'}
          value={draft}
          onChange={(value) => {
            setDraft(value)
            if (error) setError(undefined)
          }}
          error={error}
          hint="Prefira a chave da API, que é mais curta de digitar."
          inputRef={inputRef}
        />
        <Button variant="secondary" onSelect={() => setShowKey((current) => !current)}>
          {showKey ? 'Ocultar chave' : 'Mostrar chave'}
        </Button>
      </div>

      <Button variant="accent" loading={save.isPending} onSelect={submit}>
        Salvar e testar
      </Button>
      <Button variant="ghost" onSelect={onBack}>
        Cancelar
      </Button>
    </section>
  )
}
