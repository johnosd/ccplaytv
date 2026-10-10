import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { PinCreateFlow } from './PinCreateFlow'
import { TextField } from './TextField'
import { changePin, recoverPinWithSource } from '../lib/parental/pin'
import { useT } from '../lib/i18n/I18nProvider'

export interface RecoverPinFlowProps {
  /** PIN novo gravado — quem chama volta ao pedido de PIN. */
  onDone: () => void
  /** RETURN na escolha: desiste da recuperação. */
  onCancel: () => void
}

type Step = 'choose' | 'xtream' | 'm3u' | 'create'

/**
 * "Esqueci o PIN" (feature 066, US4 — FR-027..FR-030; `logic/pin.md` §5): usuário e senha de uma lista Xtream ou o
 * endereço de uma lista M3U já cadastrada, conferidos só no aparelho (`recoverPinWithSource`, nenhuma rede). Errado →
 * mensagem genérica, sem dizer o campo nem repetir o digitado, e os campos limpos. Certo → PIN novo 2× (`changePin`);
 * bloqueios e escondidas ficam. Fica em `components/` porque o abrem telas de várias features (catraca).
 */
export function RecoverPinFlow({ onDone, onCancel }: RecoverPinFlowProps): ReactNode {
  const t = useT()
  const [step, setStep] = useState<Step>('choose')
  const [row, setRow] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [checking, setChecking] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)
  const secondRef = useRef<HTMLInputElement>(null)
  // Linhas do formulário: os campos (2 no Xtream, 1 no M3U) e, por último, "Conferir".
  const checkRow = step === 'xtream' ? 2 : 1

  // Foco DOM só no campo da linha focada (é ele que abre o teclado da TV); sair da linha fecha o teclado.
  useEffect(() => {
    for (const [index, ref] of [firstRef, secondRef].entries()) if (index !== row) ref.current?.blur()
  })

  function clearFields() {
    setUsername('')
    setPassword('')
    setUrl('')
  }

  async function check() {
    if (checking) return
    setChecking(true)
    const accepted = await recoverPinWithSource(step === 'xtream' ? { username, password } : { url })
    setChecking(false)
    clearFields()
    if (accepted) setStep('create')
    else {
      setMismatch(true)
      setRow(0)
    }
  }

  if (step === 'create') {
    return (
      <PinCreateFlow
        onDone={async (pin) => {
          await changePin(pin)
          onDone()
        }}
        onCancel={onCancel}
      />
    )
  }

  const choosing = step === 'choose'

  /** OK: na escolha, abre o formulário; num campo, dá o foco de verdade (abre o teclado da TV); em "Conferir", confere. */
  function selectRow() {
    if (choosing) {
      setStep(row === 0 ? 'xtream' : 'm3u')
      setRow(0)
    } else if (row === checkRow) void check()
    else (row === 0 ? firstRef : secondRef).current?.focus()
  }
  return (
    <Modal
      ariaLabel={t('parental.recover.title')}
      onBack={() => {
        if (choosing) onCancel()
        else {
          clearFields()
          setMismatch(false)
          setStep('choose')
          setRow(0)
        }
      }}
      onDirection={(direction) => {
        if (direction === 'up' || direction === 'down') setRow((current) => Math.min(Math.max(current + (direction === 'down' ? 1 : -1), 0), choosing ? 1 : checkRow))
      }}
      onSelect={selectRow}
    >
      <div className="recover-pin">
        <p className="modal-title">{t('parental.recover.title')}</p>
        <p className="modal-description">{t('parental.recover.text')}</p>
        {choosing ? (
          <div className="modal-actions recover-pin-choices">
            <button type="button" className={`button-secondary${row === 0 ? ' tv-focus' : ''}`} onClick={() => setStep('xtream')}>
              {t('parental.recover.xtream')}
            </button>
            <button type="button" className={`button-secondary${row === 1 ? ' tv-focus' : ''}`} onClick={() => setStep('m3u')}>
              {t('parental.recover.m3u')}
            </button>
          </div>
        ) : (
          <>
            {step === 'xtream' ? (
              <>
                <TextField label={t('parental.recover.username')} purpose="username" value={username} onChange={setUsername} inputRef={firstRef} focused={row === 0} />
                <TextField label={t('parental.recover.password')} purpose="password" revealable value={password} onChange={setPassword} inputRef={secondRef} focused={row === 1} />
              </>
            ) : (
              <TextField label={t('parental.recover.url')} purpose="url" value={url} onChange={setUrl} inputRef={firstRef} focused={row === 0} />
            )}
            <p className="pin-prompt-message" role="alert">
              {mismatch ? t('parental.recover.mismatch') : ''}
            </p>
            <button type="button" className={`button-accent${row === checkRow ? ' tv-focus' : ''}`} aria-busy={checking || undefined} onClick={() => void check()}>
              {t('parental.recover.check')}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
