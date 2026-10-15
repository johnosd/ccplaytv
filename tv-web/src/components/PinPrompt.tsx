/**
 * Pedido de PIN de 4 dígitos (feature 066, `logic/pin.md` §3): teclas numéricas do controle e um teclado numérico na
 * tela, navegável pelo direcional (FR-018). Nunca mostra os dígitos (FR-012) — as casas dizem só cheia/vazia, e o
 * progresso vai no nome acessível, não no texto. PIN errado limpa e mantém o foco no teclado (FR-016), sem limite de
 * tentativas (D-010).
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { useT } from '../lib/i18n/I18nProvider'
import { isQuotaError } from '../lib/catalog/catalogRepository'
import type { RemoteDirection } from '../lib/useRemoteNav'

export interface PinPromptProps {
  /** Título já traduzido (ex.: "Digite o PIN"). */
  title: string
  /** Chamado com os 4 dígitos. `true` = aceito (quem chama fecha e segue); `false` = "PIN incorreto". */
  onSubmit: (pin: string) => Promise<boolean>
  /** RETURN ou "Cancelar". */
  onCancel: () => void
  /** Mostra "Esqueci o PIN" quando passado (FR-027). */
  onForgot?: () => void
  /** Aviso já traduzido acima do teclado (ex.: "Os PINs não são iguais"), além do "PIN incorreto". */
  notice?: string
}

const PIN_LENGTH = 4
/** Teclado 3×4: `erase` apaga o último dígito, `cancel` fecha. O foco começa no 5 (centro). */
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'erase', '0', 'cancel'] as const
const PAD_COLS = 3
const START = PAD.indexOf('5')
/** Índice do "Esqueci o PIN", abaixo do teclado. */
const FORGOT = PAD.length

export function PinPrompt({ title, onSubmit, onCancel, onForgot, notice }: PinPromptProps): ReactNode {
  const t = useT()
  const [filled, setFilled] = useState(0)
  // PIN incorreto, ou falha ao gravar/conferir (nunca fica parado sem dizer nada).
  const [problem, setProblem] = useState<'wrong' | 'error' | null>(null)
  // Código do catálogo de erros (R-017): STO-01 sem espaço, PAR-01 qualquer outra falha — nunca o erro cru.
  const [errorCode, setErrorCode] = useState<'STO-01' | 'PAR-01'>('PAR-01')
  const [focus, setFocus] = useState(START)
  // Os dígitos ficam num ref: nunca no estado que desenha, e duas teclas no mesmo quadro não se perdem.
  const digits = useRef('')
  const pending = useRef(false)

  function type(digit: string) {
    if (pending.current || digits.current.length >= PIN_LENGTH) return
    digits.current += digit
    setFilled(digits.current.length)
    setProblem(null)
    if (digits.current.length < PIN_LENGTH) return
    pending.current = true
    const pin = digits.current
    const retry = (reason: 'wrong' | 'error') => {
      pending.current = false
      digits.current = ''
      setFilled(0)
      setProblem(reason)
      setFocus(START)
    }
    onSubmit(pin).then(
      (accepted) => {
        if (accepted) pending.current = false
        else retry('wrong')
      },
      (error: unknown) => {
        setErrorCode(isQuotaError(error) ? 'STO-01' : 'PAR-01')
        retry('error')
      },
    )
  }

  function erase() {
    if (pending.current) return
    digits.current = digits.current.slice(0, -1)
    setFilled(digits.current.length)
  }

  function activate(index: number) {
    if (index === FORGOT) onForgot?.()
    else if (PAD[index] === 'erase') erase()
    else if (PAD[index] === 'cancel') onCancel()
    else type(PAD[index])
  }

  // Teclas 0–9 do controle (registradas no Tizen por `registerDigitKeys`); o `Modal` só intercepta setas/OK/Voltar.
  const typeRef = useRef(type)
  useEffect(() => {
    typeRef.current = type
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!/^[0-9]$/.test(event.key)) return
      event.preventDefault()
      typeRef.current(event.key)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function move(direction: RemoteDirection) {
    setFocus((current) => {
      if (current === FORGOT) return direction === 'up' ? PAD.indexOf('0') : current
      const row = Math.floor(current / PAD_COLS)
      const col = current % PAD_COLS
      if (direction === 'left') return col > 0 ? current - 1 : current
      if (direction === 'right') return col < PAD_COLS - 1 ? current + 1 : current
      if (direction === 'up') return row > 0 ? current - PAD_COLS : current
      if (row < PAD.length / PAD_COLS - 1) return current + PAD_COLS
      return onForgot ? FORGOT : current
    })
  }

  const label = (key: (typeof PAD)[number]) => (key === 'erase' ? t('parental.pin.erase') : key === 'cancel' ? t('parental.pin.cancel') : key)

  return (
    <Modal ariaLabel={title} onDirection={move} onSelect={() => activate(focus)} onBack={onCancel}>
      <div className="pin-prompt">
        <h2 className="pin-prompt-title">{title}</h2>
        <div className="pin-prompt-slots" role="img" aria-label={t('parental.pin.progress', { filled })}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <span key={index} className={`pin-prompt-slot${index < filled ? ' is-filled' : ''}`} />
          ))}
        </div>
        <p className="pin-prompt-message" role="alert">
          {problem === 'wrong' ? t('parental.pin.wrong') : problem === 'error' ? `${t('parental.control.saveError')} (${errorCode})` : (notice ?? '')}
        </p>
        <div className="pin-prompt-pad">
          {PAD.map((key, index) => (
            <button
              key={key}
              type="button"
              className={`pin-prompt-key no-scale${key.length > 1 ? ' is-action' : ''}${focus === index ? ' tv-focus' : ''}`}
              onClick={() => activate(index)}
            >
              {label(key)}
            </button>
          ))}
        </div>
        {onForgot && (
          <button type="button" className={`pin-prompt-forgot button-ghost${focus === FORGOT ? ' tv-focus' : ''}`} onClick={onForgot}>
            {t('parental.pin.forgot')}
          </button>
        )}
      </div>
    </Modal>
  )
}
