import type { ReactNode } from 'react'
import { TextField } from '../../components/TextField'
import { useT } from '../../lib/i18n/I18nProvider'

export interface SourceFormValues {
  displayName: string
  m3uUrl: string
  dns: string
  username: string
  password: string
}

export interface SourceFormFieldsProps {
  mode: 'url' | 'provider'
  isEditing: boolean
  values: SourceFormValues
  onChange: (field: keyof SourceFormValues, value: string) => void
}

/**
 * Campos do cadastro/edição de lista (extraídos do `AddSourceScreen` na feature 070, teto de linhas).
 * Rótulos preservados — contratos 037 e 045 dependem deles: Nome da lista, URL M3U, Servidor, Usuário, Senha.
 */
export function SourceFormFields({ mode, isEditing, values, onChange }: SourceFormFieldsProps): ReactNode {
  const t = useT()
  return (
    <div className="source-setup-fields">
      <div className="source-setup-field--wide">
        <TextField label={t('add.field.name')} purpose="text" enterKeyHint="next" value={values.displayName} onChange={(value) => onChange('displayName', value)} />
      </div>
      {mode === 'url' ? (
        <div className="source-setup-field--wide">
          <TextField
            label={t('add.field.m3u')}
            purpose="url"
            enterKeyHint="done"
            value={values.m3uUrl}
            onChange={(value) => onChange('m3uUrl', value)}
            hint={isEditing ? t('add.hint.keepUrl') : undefined}
          />
        </div>
      ) : (
        <>
          <div className="source-setup-field--wide">
            <TextField label={t('add.field.server')} purpose="url" enterKeyHint="next" value={values.dns} onChange={(value) => onChange('dns', value)} />
          </div>
          <TextField
            label={t('add.field.user')}
            purpose="username"
            enterKeyHint="next"
            value={values.username}
            onChange={(value) => onChange('username', value)}
            hint={isEditing ? t('add.hint.keepUser') : undefined}
          />
          <TextField
            label={t('add.field.password')}
            purpose="password"
            revealable
            revealNoun={t('textField.password')}
            enterKeyHint="done"
            value={values.password}
            onChange={(value) => onChange('password', value)}
            hint={isEditing ? t('add.hint.keepPassword') : undefined}
          />
        </>
      )}
    </div>
  )
}
