import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SplashScreen } from './features/splash/SplashScreen'
import { HomeScreen } from './features/home/HomeScreen'
import { AddSourceScreen } from './features/import/AddSourceScreen'
import { ImportProgressScreen } from './features/import/ImportProgressScreen'
import {
  TERMINAL_STATUSES,
  useImportJob,
  useOpenSource,
  type SourceOut,
} from './features/import/importApi'
import { ListHomeScreen, type ListDestination } from './features/list-home/ListHomeScreen'
import { LiveScreen } from './features/live/LiveScreen'
import { MoviesScreen } from './features/movies/MoviesScreen'
import { MovieDetailScreen } from './features/movies/MovieDetailScreen'
import { SeriesScreen } from './features/series/SeriesScreen'
import { SeriesDetailScreen } from './features/series/SeriesDetailScreen'

type Screen =
  | { name: 'splash' }
  | { name: 'home' }
  | { name: 'add-source' }
  | { name: 'edit-source'; source: SourceOut }
  | { name: 'progress'; jobId: string }
  | { name: 'list-home'; source: SourceOut }
  | { name: 'live'; source: SourceOut }
  | { name: 'movies'; source: SourceOut }
  | { name: 'movie-detail'; source: SourceOut; movieId: string }
  | { name: 'series'; source: SourceOut }
  | { name: 'series-detail'; source: SourceOut; seriesId: string }

interface NavState {
  screen: Screen
  history: Screen[]
}

function App() {
  const [nav, setNav] = useState<NavState>({ screen: { name: 'splash' }, history: [] })
  const { screen } = nav

  // Migração única e atualização por idade (feature 004, D-004): a TV só
  // avisa "abri esta fonte" — quem decide migrar/atualizar/nada é o
  // backend. Fica no componente raiz, não em ListHomeScreen/LiveScreen,
  // porque a atualização pode terminar depois que o usuário já navegou
  // para outra tela, e o acompanhamento não pode se perder na troca.
  const openSource = useOpenSource()
  const [autoRefreshJobId, setAutoRefreshJobId] = useState<string | null>(null)
  const autoRefreshJob = useImportJob(autoRefreshJobId)
  const queryClient = useQueryClient()
  // Evita reconciliar duas vezes pro mesmo job (o efeito roda de novo a
  // cada poll, não só na virada pra terminal) — sem precisar de outro
  // setState dentro do efeito pra "desarmar" o acompanhamento.
  const reconciledJobRef = useRef<string | null>(null)

  useEffect(() => {
    const status = autoRefreshJob.data?.status
    if (!autoRefreshJobId || !status || !TERMINAL_STATUSES.includes(status)) return
    if (reconciledJobRef.current === autoRefreshJobId) return
    reconciledJobRef.current = autoRefreshJobId
    // O catálogo pode ter sido substituído (D-002) — invalida em vez de
    // assumir; quem estiver com a tela de canais montada revalida sozinho,
    // reconciliando o foco por identidade (LiveScreen). Fonte de falha não
    // muda nada visível aqui: connection_state/last_successful_sync_at já
    // não avançam no backend quando o job falha (FR-023).
    void queryClient.invalidateQueries({ queryKey: ['catalog-items'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-counts'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-item'] })
    void queryClient.invalidateQueries({ queryKey: ['sources'] })
  }, [autoRefreshJobId, autoRefreshJob.data?.status, queryClient])

  function openSourceCatalog(source: SourceOut) {
    goto({ name: 'list-home', source })
    // Fogo e esquece: a leitura do catálogo sempre serve o que está
    // publicado agora (cache-first, ADR-002); a navegação nunca espera essa
    // decisão.
    openSource.mutate(source.id, {
      onSuccess: (result) => {
        if (result.triggered && result.import_job_id) {
          setAutoRefreshJobId(result.import_job_id)
        }
      },
    })
  }

  function goto(next: Screen) {
    setNav((s) => ({ screen: next, history: [...s.history, s.screen] }))
  }

  function back() {
    setNav((s) => {
      if (s.history.length === 0) return s
      return { screen: s.history[s.history.length - 1], history: s.history.slice(0, -1) }
    })
  }

  function goHome() {
    setNav({ screen: { name: 'home' }, history: [] })
  }

  switch (screen.name) {
    case 'splash':
      return <SplashScreen onFinished={goHome} />

    case 'home':
      return (
        <HomeScreen
          onAddSource={() => goto({ name: 'add-source' })}
          onOpenSource={openSourceCatalog}
          onEditSource={(source) => goto({ name: 'edit-source', source })}
          onResyncStarted={(jobId) => goto({ name: 'progress', jobId })}
          onSourceCreated={({ jobId }) => goto({ name: 'progress', jobId })}
        />
      )

    case 'add-source':
      return (
        <AddSourceScreen
          onSourceCreated={({ jobId }) => goto({ name: 'progress', jobId })}
          onBack={back}
        />
      )

    case 'edit-source':
      return (
        <AddSourceScreen
          existingSource={screen.source}
          onSourceCreated={({ jobId }) => goto({ name: 'progress', jobId })}
          onSourceUpdated={back}
          onBack={back}
        />
      )

    case 'progress':
      return (
        <ImportProgressScreen
          jobId={screen.jobId}
          onRetried={(newJobId) => goto({ name: 'progress', jobId: newJobId })}
          onBack={goHome}
        />
      )

    case 'list-home':
      return (
        <ListHomeScreen
          sourceId={screen.source.id}
          sourceName={screen.source.display_name}
          onSelect={(destination: ListDestination) => goto({ name: destination, source: screen.source } as Screen)}
          onBack={back}
        />
      )

    case 'live':
      return <LiveScreen sourceId={screen.source.id} onBack={back} />

    case 'movies':
      return (
        <MoviesScreen sourceId={screen.source.id} onOpenMovie={(movieId) => goto({ name: 'movie-detail', source: screen.source, movieId } as Screen)} onBack={back} />
      )

    case 'movie-detail':
      return <MovieDetailScreen movieId={screen.movieId} onBack={back} />

    case 'series':
      return (
        <SeriesScreen sourceId={screen.source.id} onOpenSeries={(seriesId) => goto({ name: 'series-detail', source: screen.source, seriesId } as Screen)} onBack={back} />
      )

    case 'series-detail':
      return <SeriesDetailScreen seriesId={screen.seriesId} onBack={back} />

    default:
      return null
  }
}

export default App
