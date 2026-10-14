import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSaveTmdbKey } from '../catalog/catalogApi'
import { useTvKeyNav } from '../../lib/useTvKeyNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useImeChain } from '../../lib/useImeChain'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { SaveTmdbKeyFailure } from '../../lib/metadata/types'

export interface TmdbKeyScreenProps {
  /** Chave aceita pelo TMDB e gravada — quem abriu a tela volta a Configurações. */
  onSaved: () => void
  onBack: () => void
}

/** Motivo → chave da mensagem para quem digitou. Nunca ecoa o que foi digitado (FR-013). */
const FAILURE_MESSAGE_KEY: Record<SaveTmdbKeyFailure, MessageKey> = {
  invalid_format: 'settings.tmdbKey.failure.invalid_format',
  refused: 'settings.tmdbKey.failure.refused',
  offline: 'settings.tmdbKey.failure.offline',
  rate_limited: 'settings.tmdbKey.failure.rate_limited',
}

/** Código da tabela de erros de cada motivo (feature 042); `invalid_format` é validação local, sem código. */
const FAILURE_CODE: Partial<Record<SaveTmdbKeyFailure, string>> = {
  refused: 'API-401',
  offline: 'NET-02',
  rate_limited: 'API-429',
}

/**
 * Tela da chave TMDB (feature 032, US2, `logic/integracoes-e-dock.md` §2).
 * Foco DOM real (`useTvKeyNav`) e IME da TV, no molde de `EpgSettingsScreen`.
 *
 * **O campo começa sempre vazio** — a chave guardada nunca volta para a tela
 * (nem para "Editar"): quem edita digita a nova. "Mostrar" só alterna a
 * máscara do que a própria pessoa acabou de digitar. Uma chave recusada nunca
 * é gravada; o foco volta ao campo. O "Mostrar/Ocultar" é do próprio `TextField`
 * (feature 045): volta mascarado ao sair da tela.
 */
export function TmdbKeyScreen({ onSaved, onBack }: TmdbKeyScreenProps): ReactNode {
  const t = useT()
  const containerRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  useTvKeyNav(containerRef)
  useImeChain(containerRef, saveRef) // Done do IME leva o foco a "Salvar e testar", sem enviar (feature 045)
  useRemoteNav({ onBack })

  const [draft, setDraft] = useState('')
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
        // Feature 042: o código vem da tabela de erros (nunca o que foi digitado nem a resposta crua).
        const code = FAILURE_CODE[result.reason]
        const message = t(FAILURE_MESSAGE_KEY[result.reason])
        setError(code ? `${message} (${code})` : message)
        inputRef.current?.focus()
      },
      onError: () => {
        setError(t(FAILURE_MESSAGE_KEY.offline))
        inputRef.current?.focus()
      },
    })
  }

  return (
    <section className="screen epg-settings tmdb-key no-scrollbar form-scroll-room" ref={containerRef} aria-labelledby="tmdb-key-title">
      <h1 id="tmdb-key-title" className="screen-title">
        {t('settings.tmdbKey.title')}
      </h1>
      <p className="epg-settings-note">{t('settings.tmdbKey.note')}</p>

      <div className="epg-settings-field">
        <TextField
          label={t('settings.tmdbKey.field')}
          purpose="password"
          revealable
          revealNoun={t('settings.tmdbKey.revealNoun')}
          enterKeyHint="done"
          value={draft}
          onChange={(value) => {
            setDraft(value)
            if (error) setError(undefined)
          }}
          error={error}
          hint={t('settings.tmdbKey.hint')}
          inputRef={inputRef}
        />
      </div>

      <Button variant="accent" loading={save.isPending} onSelect={submit} buttonRef={saveRef}>
        {t('settings.tmdbKey.save')}
      </Button>
      <Button variant="ghost" onSelect={onBack}>
        {t('common.cancel')}
      </Button>
    </section>
  )
}
