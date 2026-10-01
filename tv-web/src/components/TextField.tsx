import { useId } from 'react'
import type { ReactNode, Ref } from 'react'
import { Icon } from './Icon'

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
export function TextField({ label, value, onChange, purpose, error, hint, id, inputRef, focused }: TextFieldProps): ReactNode {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const hintId = `${fieldId}-hint`
  const attrs = PURPOSE_ATTRS[purpose] ?? PURPOSE_ATTRS.text
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={`text-field${focused ? ' tv-focus' : ''}`}>
      <label className="text-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        className="text-field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={attrs.inputMode}
        type={attrs.type ?? 'text'}
        autoComplete={attrs.autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      />
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
