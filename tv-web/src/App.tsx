import { useState } from 'react'
import { SplashScreen } from './features/splash/SplashScreen'
import { HomeScreen } from './features/home/HomeScreen'
import { AddSourceScreen } from './features/import/AddSourceScreen'
import { ImportProgressScreen } from './features/import/ImportProgressScreen'
import type { SourceOut } from './features/import/importApi'
import { ListHomeScreen, type ListDestination } from './features/list-home/ListHomeScreen'
import { LiveScreen } from './features/live/LiveScreen'
import { MoviesScreen } from './features/movies/MoviesScreen'
import { MovieDetailScreen } from './features/movies/MovieDetailScreen'
import { SeriesScreen } from './features/series/SeriesScreen'
import { SeriesDetailScreen } from './features/series/SeriesDetailScreen'
import { MOVIES, SERIES } from './features/catalog/mockCatalog'

type Screen =
  | { name: 'splash' }
  | { name: 'home' }
  | { name: 'add-source' }
  | { name: 'progress'; jobId: string }
  | { name: 'list-home'; source: SourceOut }
  | { name: 'live'; source: SourceOut }
  | { name: 'movies' }
  | { name: 'movie-detail'; movieId: string }
  | { name: 'series' }
  | { name: 'series-detail'; seriesId: string }

interface NavState {
  screen: Screen
  history: Screen[]
}

function App() {
  const [nav, setNav] = useState<NavState>({ screen: { name: 'splash' }, history: [] })
  const { screen } = nav

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
          onOpenSource={(source) => goto({ name: 'list-home', source })}
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
          sourceName={screen.source.display_name}
          movieCount={MOVIES.length}
          seriesCount={SERIES.length}
          onSelect={(destination: ListDestination) =>
            // A Live TV precisa saber de qual fonte ler o catálogo; Filmes e
            // Séries ainda leem o mock e não recebem a fonte.
            goto(
              destination === 'live'
                ? { name: 'live', source: screen.source }
                : { name: destination },
            )
          }
          onBack={back}
        />
      )

    case 'live':
      return <LiveScreen sourceId={screen.source.id} onBack={back} />

    case 'movies':
      return (
        <MoviesScreen onOpenMovie={(movieId) => goto({ name: 'movie-detail', movieId })} onBack={back} />
      )

    case 'movie-detail':
      return <MovieDetailScreen movieId={screen.movieId} onBack={back} />

    case 'series':
      return (
        <SeriesScreen
          onOpenSeries={(seriesId) => goto({ name: 'series-detail', seriesId })}
          onBack={back}
        />
      )

    case 'series-detail':
      return <SeriesDetailScreen seriesId={screen.seriesId} onBack={back} />

    default:
      return null
  }
}

export default App
