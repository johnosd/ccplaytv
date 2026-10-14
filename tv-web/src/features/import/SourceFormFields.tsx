import { useState, type ReactNode } from 'react'
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
 * Rótulos do formulário: Playlist Name, URL M3U, Host, User Name, Password.
 *
 * Feature 070 (FR-010, D-007): os dados nascem **visíveis** e um único olho do formulário
 * ("Ocultar dados"/"Mostrar dados") mascara Servidor/URL, Usuário e Senha de uma vez. O estado é daqui:
 * sair da tela volta a mostrar, nunca é persistido. Na edição, o texto "Deixe em branco para manter"
 * só aparece onde o campo está de fato em branco (não há valor salvo para mostrar).
 */
export function SourceFormFields({ mode, isEditing, values, onChange }: SourceFormFieldsProps): ReactNode {
  const t = useT()
  const [masked, setMasked] = useState(false)
  const keepHint = (value: string, text: string) => (isEditing && value === '' ? text : undefined)
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
            masked={masked}
            enterKeyHint="done"
            value={values.m3uUrl}
            onChange={(value) => onChange('m3uUrl', value)}
            hint={keepHint(values.m3uUrl, t('add.hint.keepUrl'))}
          />
        </div>
      ) : (
        <>
          <div className="source-setup-field--wide">
            <TextField label={t('add.field.server')} purpose="url" masked={masked} enterKeyHint="next" value={values.dns} onChange={(value) => onChange('dns', value)} />
          </div>
          <TextField
            label={t('add.field.user')}
            purpose="username"
            masked={masked}
            enterKeyHint="next"
            value={values.username}
            onChange={(value) => onChange('username', value)}
            hint={keepHint(values.username, t('add.hint.keepUser'))}
          />
          <TextField
            label={t('add.field.password')}
            purpose="password"
            masked={masked}
            enterKeyHint="done"
            value={values.password}
            onChange={(value) => onChange('password', value)}
            hint={keepHint(values.password, t('add.hint.keepPassword'))}
          />
        </>
      )}
      {/* Logo depois dos campos no DOM (ordem de foco). Nome e texto mudam com o estado, nunca só cor;
          nada aqui lê os valores digitados (constitution: segredo fora de rótulo/anúncio/log). */}
      <div className="source-setup-field--wide source-setup-eye">
        <button
          type="button"
          className="button-secondary"
          aria-pressed={masked}
          onClick={() => setMasked((current) => !current)}
        >
          {masked ? t('add.eye.show') : t('add.eye.hide')}
        </button>
      </div>
    </div>
  )
}
