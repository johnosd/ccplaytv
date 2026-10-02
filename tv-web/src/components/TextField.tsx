import { useId, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { Icon } from './Icon'
import { revealInTopHalf } from '../lib/focus/revealInTopHalf'

export type TextFieldPurpose = 'search' | 'url' | 'username' | 'password' | 'text'

export interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  purpose: TextFieldPurpose
  error?: string
  /**
   * Texto de apoio sempre visível sob o campo (feature 023, D-013) — no lugar
   * de um placeholder que some ao digitar (DS V14 §37), por exemplo "Deixe em
   * branco para manter a senha atual". Ligado ao campo por `aria-describedby`.
   */
  hint?: string
  id?: string
  /** Acesso ao `<input>` real (feature 026) — para dar/tirar foco de fato (abrir/fechar o IME). Aditivo, sem contrato travado. */
  inputRef?: Ref<HTMLInputElement>
  /** Foco de estado (ADR-009) — aplica `.tv-focus` no campo. Aditivo, sem contrato travado. */
  focused?: boolean
  /**
   * Feature 045 (US4, D-010): controle "Mostrar/Ocultar" logo depois do campo. Só vale
   * com `purpose="password"`. O estado é do próprio componente — desmontar a tela (sair
   * por qualquer caminho) volta a mascarar; nunca é persistido nem vira prop de tela.
   */
  revealable?: boolean
  /** O que o controle revela, no nome acessível: "senha" → "Mostrar senha". Padrão: "senha". */
  revealNoun?: string
  /** Dica do rótulo da tecla de ação do teclado da TV (`enterkeyhint`): "next" avança, "done" conclui. */
  enterKeyHint?: 'next' | 'done'
}

interface PurposeAttrs {
  inputMode?: 'search' | 'url' | 'text'
  type?: string
  autoComplete?: string
}

const PURPOSE_ATTRS: Record<TextFieldPurpose, PurposeAttrs> = {
  search: { inputMode: 'search' },
  url: { inputMode: 'url', type: 'url' },
  username: { autoComplete: 'username' },
  password: { type: 'password', autoComplete: 'current-password' },
  text: {},
}

/**
 * Campo de texto isolado, com IME correto por `purpose` (feature 022,
 * D-015 do plan.md) — rótulo sempre visível, nunca um placeholder que
 * desaparece ao digitar. Sem encadeamento com outros campos (fora de
 * escopo desta feature).
 */
export function TextField({
  label,
  value,
  onChange,
  purpose,
  error,
  hint,
  id,
  inputRef,
  focused,
  revealable,
  revealNoun = 'senha',
  enterKeyHint,
}: TextFieldProps): ReactNode {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const hintId = `${fieldId}-hint`
  const attrs = PURPOSE_ATTRS[purpose] ?? PURPOSE_ATTRS.text
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const [revealed, setRevealed] = useState(false)
  const canReveal = Boolean(revealable) && purpose === 'password'

  const input = (
    <input
      ref={inputRef}
      id={fieldId}
      className="text-field-input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // Feature 045 (US3): o campo focado sobe para a metade de cima, longe do teclado da TV.
      onFocus={(event) => revealInTopHalf(event.currentTarget.closest<HTMLElement>('.text-field') ?? event.currentTarget)}
      inputMode={attrs.inputMode}
      // O mesmo <input> troca de tipo (sem remontar): foco e cursor não se perdem ao revelar.
      type={canReveal && revealed ? 'text' : (attrs.type ?? 'text')}
      autoComplete={attrs.autoComplete}
      enterKeyHint={enterKeyHint}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
    />
  )

  return (
    <div className={`text-field${focused ? ' tv-focus' : ''}`}>
      <label className="text-field-label" htmlFor={fieldId}>
        {label}
      </label>
      {revealable ? (
        <div className="text-field-control">
          {input}
          {canReveal && (
            // Logo depois do campo no DOM (ordem de foco, FR-019). Nome muda E `aria-pressed`
            // (FR-021); o texto visível também muda, então o estado nunca depende só de cor.
            // Nada aqui lê `value`: o valor digitado nunca vai a rótulo, anúncio ou log (FR-022).
            <button
              type="button"
              className="button-secondary text-field-reveal"
              aria-pressed={revealed}
              aria-label={`${revealed ? 'Ocultar' : 'Mostrar'} ${revealNoun}`}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? 'Ocultar' : 'Mostrar'}
            </button>
          )}
        </div>
      ) : (
        input
      )}
      {hint && (
        <p id={hintId} className="text-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-field-error">
          <Icon name="info" />
          {error}
        </p>
      )}
    </div>
  )
}
