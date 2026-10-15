import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PrimaryProgress } from './detailProgress'
import { formatDurationMinutes } from './detailMetadataFormat'

/**
 * Ações do hero do detalhe (feature 059, `logic/hero-cinema.md` §3–§4). Só
 * apresentação: o foco é estado de quem usa (`row`/`actionFocus` de cada tela).
 *
 * O RÓTULO É SEMPRE UM NÓ DE TEXTO DIRETO do elemento que carrega `tv-focus`/
 * `is-soft-disabled`/`aria-disabled` (D-002): os contratos travados das
 * features 032/033/059 leem `getByText(rótulo).className`, e o `getByText` só
 * enxerga os filhos de texto diretos. Rótulo dentro de um `<span>` filho
 * quebraria todos eles. `vod-detail-action` fica em todas — os E2E a usam.
 */

export interface DetailPrimaryActionProps {
  label: string
  focused: boolean
  /** Barra + "faltam X" — só com posição E duração reais (`primaryProgress`). */
  progress: PrimaryProgress | null
}

export function DetailPrimaryAction({ label, focused, progress }: DetailPrimaryActionProps): ReactNode {
  const t = useT()
  return (
    <div className={`vod-detail-action vod-detail-action--primary${progress ? ' vod-detail-action--progress' : ''}${focused ? ' tv-focus' : ''}`}>
      {label}
      {progress && (
        <span className="vod-detail-progress">
          <span
            className="vod-detail-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span className="vod-detail-progress-fill" style={{ width: `${progress.percent}%` }} />
          </span>
          <span className="vod-detail-remaining">
            {t('detail.remaining', { time: formatDurationMinutes(progress.remainingSeconds) })}
          </span>
        </span>
      )}
    </div>
  )
}

export type DetailIconName = 'restart' | 'add' | 'added' | 'trailer' | 'similar' | 'watched' | 'unwatch' | 'remove'

/** Ícones locais (Spec V14 §15): traço `currentColor`, 24×24. */
const ICON_PATHS: Record<DetailIconName, ReactNode> = {
  restart: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v5h5" />
    </>
  ),
  add: <path d="M12 5v14M5 12h14" />,
  added: <path d="M5 12.5l4.5 4.5L19 7" />,
  trailer: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9l5 3-5 3z" />
    </>
  ),
  similar: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  watched: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  unwatch: <path d="M5 12.5l4.5 4.5L19 7" />,
  remove: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
}

export interface DetailIconActionProps {
  icon: DetailIconName
  label: string
  focused: boolean
  /** Ação que existe mas ainda não age (Trailer consultando/indisponível) — continua focável. */
  softDisabled?: boolean
  /** Estado "ligado" (na Minha Lista, assistido): só muda o tom do ícone. */
  active?: boolean
}

export function DetailIconAction({ icon, label, focused, softDisabled, active }: DetailIconActionProps): ReactNode {
  return (
    <div
      role="button"
      className={`vod-detail-action vod-detail-icon-action${active ? ' is-active' : ''}${focused ? ' tv-focus' : ''}${softDisabled ? ' is-soft-disabled' : ''}`}
      aria-disabled={softDisabled ? 'true' : undefined}
    >
      <span className="vod-detail-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          {ICON_PATHS[icon]}
        </svg>
      </span>
      {label}
    </div>
  )
}
