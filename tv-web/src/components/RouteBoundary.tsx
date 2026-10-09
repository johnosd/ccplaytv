import { Component, Fragment, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ErrorState } from './ErrorState'
import { Spinner } from './Spinner'
import { useT } from '../lib/i18n/I18nProvider'
import { useRemoteNav } from '../lib/useRemoteNav'
import { Button } from './Button'
import { resetRouteModule } from '../navigation/lazyRoute'

interface RouteErrorBoundaryProps {
  children: ReactNode
  onBack: () => void
  resetKey: number
  onRetry: () => void
}

interface RouteErrorBoundaryState {
  failed: boolean
  resetKey: number
}

/**
 * Fronteira de erro da rota. O erro original fica deliberadamente restrito ao
 * boundary: ele pode conter a URL completa do chunk, portanto nunca chega à
 * tela, ao log ou à mensagem acessível.
 */
class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<RouteErrorBoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: RouteErrorBoundaryProps,
    state: RouteErrorBoundaryState,
  ): Partial<RouteErrorBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <RouteErrorFallback onBack={this.props.onBack} onRetry={this.props.onRetry} />
    }
    return this.props.children
  }
}

function RouteLoadingFallback({ onBack }: Pick<RouteBoundaryProps, 'onBack'>): ReactNode {
  const t = useT()
  const buttonRef = useRef<HTMLButtonElement>(null)
  useRemoteNav({ onSelect: onBack, onBack }, { modal: true })

  useEffect(() => {
    buttonRef.current?.focus()
  }, [])

  return (
    <div className="screen route-boundary" aria-busy="true">
      <Spinner size={48} />
      <p className="empty-state-title" aria-live="polite">{t('common.routeLoading')}</p>
      <Button variant="secondary" focused onSelect={onBack} buttonRef={buttonRef}>{t('common.back')}</Button>
    </div>
  )
}

function RouteErrorFallback({ onBack, onRetry }: Pick<RouteErrorBoundaryProps, 'onBack' | 'onRetry'>): ReactNode {
  const t = useT()
  const [focusedActionIndex, setFocusedActionIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  useRemoteNav({
    onDirection: (direction) => setFocusedActionIndex(direction === 'left' || direction === 'up' ? 0 : 1),
    onSelect: focusedActionIndex === 0 ? onRetry : onBack,
    onBack,
  }, { modal: true })
  useEffect(() => {
    rootRef.current?.querySelectorAll('button')[focusedActionIndex]?.focus()
  }, [focusedActionIndex])

  return (
    <div ref={rootRef} className="screen route-boundary" role="alert" aria-live="assertive">
      <ErrorState
        title={t('common.routeError')}
        description={t('common.routeErrorDescription')}
        actions={[{ label: t('common.retry'), onSelect: onRetry }, { label: t('common.back'), onSelect: onBack }]}
        focusedActionIndex={focusedActionIndex}
      />
    </div>
  )
}

export interface RouteBoundaryProps {
  children: ReactNode
  onBack: () => void
}

/**
 * Suspense e erro ficam limitados à rota atual. O retry muda a identidade da
 * árvore para que cada tentativa crie uma nova promise de import, sem tocar no
 * QueryClient nem disparar consulta só por foco ou navegação.
 */
export function RouteBoundary({ children, onBack }: RouteBoundaryProps): ReactNode {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    resetRouteModule(children)
    setAttempt((current) => current + 1)
  }, [children])

  return (
    <RouteErrorBoundary resetKey={attempt} onRetry={retry} onBack={onBack}>
      <Suspense fallback={<RouteLoadingFallback onBack={onBack} />}>
        <Fragment key={attempt}>{children}</Fragment>
      </Suspense>
    </RouteErrorBoundary>
  )
}
