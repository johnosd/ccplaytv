import { useId } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export type TextFieldPurpose = 'search' | 'url' | 'username' | 'password' | 'text'

export interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  purpose: TextFieldPurpose
  error?: string
  id?: string
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
export function TextField({ label, value, onChange, purpose, error, id }: TextFieldProps): ReactNode {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const errorId = `${fieldId}-error`
  const attrs = PURPOSE_ATTRS[purpose] ?? PURPOSE_ATTRS.text

  return (
    <div className="text-field">
      <label className="text-field-label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className="text-field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={attrs.inputMode}
        type={attrs.type ?? 'text'}
        autoComplete={attrs.autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-field-error">
          <Icon name="info" />
          {error}
        </p>
      )}
    </div>
  )
}
