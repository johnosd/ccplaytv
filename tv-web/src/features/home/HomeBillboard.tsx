import type { ReactNode } from 'react'
import { useId } from 'react'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PrimaryProgress } from '../vod/detailProgress'
import { formatDurationMinutes } from '../vod/detailMetadataFormat'

/** Uma ação do billboard (ou do hero de boas-vindas). `id` é o de `HomeFocus.hero.action` / `shortcut-*`. */
export interface BillboardAction {
  id: string
  label: string
  /** Estado "indisponível agora" (ex.: Trailer consultando/sem candidato) — o botão segue focável. */
  softDisabled?: boolean
  /** Só a primária: barra e "T1:E3 · faltam X" — apenas com posição E duração reais (`primaryProgress`). */
  progress?: PrimaryProgress | null
  /** Só a primária de série: código do episódio em andamento (`T1:E3`). */
  code?: string | null
}

export interface HomeBillboardProps {
  /** `expanded` com o foco no billboard/dock; `collapsed` com o foco nas fileiras (contrato 060, D-002). */
  state: 'expanded' | 'collapsed'
  ariaLabel: string
  eyebrow?: string
  title: string
  /** Linha de metadata (ano, duração, nota) — já montada por quem usa. Ausente = sem linha. */
  meta?: ReactNode
  /** Categoria da lista + gêneros (`DetailChips`). */
  chips?: ReactNode
  /** Sinopse em até 3 linhas; só a que já está no aparelho. */
  synopsis?: string
  /** Texto do hero de boas-vindas (no lugar de meta/chips/sinopse). */
  description?: string
  actions: BillboardAction[]
  /** Id da ação com o foco; `undefined` quando o foco não está nas ações. */
  focusedActionId?: string
  /** Ícones de serviços (`.home-dock`), no canto do billboard. */
  dock: ReactNode
}

/**
 * Billboard do Início (feature 060, `logic/billboard-e-navegacao.md` §2): título, metadata, chips, sinopse e ações sobre o
 * fundo ambiente. Só apresentação — o foco é estado do `HomeContent`.
 *
 * O NOME ACESSÍVEL da ação é só o rótulo (nó de texto direto do botão): o contrato travado da 026 exige
 * `/^(▶\s*)?Continuar$/`. O "T1:E3 · faltam 26 min" vai num `span` `aria-hidden` ligado por `aria-describedby` (lido como
 * descrição, fora do nome), e a barra é decorativa.
 */
export function HomeBillboard({
  state,
  ariaLabel,
  eyebrow,
  title,
  meta,
  chips,
  synopsis,
  description,
  actions,
  focusedActionId,
  dock,
}: HomeBillboardProps): ReactNode {
  const t = useT()
  const hintId = useId()

  return (
    <section className="home-hero" data-state={state} aria-label={ariaLabel}>
      <div className="home-hero-dock">{dock}</div>
      <div className="home-hero-info">
        {eyebrow && <div className="home-hero-eyebrow">{eyebrow}</div>}
        <div className="home-hero-title">{title}</div>
        {description !== undefined ? (
          <p className="home-hero-description">{description}</p>
        ) : (
          <>
            {meta}
            {chips}
            {synopsis && <p className="home-hero-synopsis">{synopsis}</p>}
          </>
        )}
        <div className="home-hero-actions">
          {actions.map((action) => {
            const progress = action.progress ?? null
            const hint = [action.code, progress && t('home.progress.left', { time: formatDurationMinutes(progress.remainingSeconds) })]
              .filter(Boolean)
              .join(' · ')
            const describedBy = hint !== '' ? `${hintId}-${action.id}` : undefined
            return (
              <button
                key={action.id}
                type="button"
                className={`home-hero-action${action.id === 'primary' ? ' home-hero-action--primary' : ''}${focusedActionId === action.id ? ' tv-focus' : ''}${action.softDisabled ? ' is-soft-disabled' : ''}`}
                // Feature 028 (FR-016): o estado indisponível também vai para a tecnologia assistiva, não só para a aparência.
                aria-disabled={action.softDisabled ? 'true' : undefined}
                aria-describedby={describedBy}
              >
                {action.label}
                {progress && (
                  <span className="home-hero-progress" aria-hidden="true">
                    <span className="home-hero-progress-fill" style={{ width: `${progress.percent}%` }} />
                  </span>
                )}
                {describedBy && (
                  <span id={describedBy} className="home-hero-action-hint" aria-hidden="true">
                    {hint}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
