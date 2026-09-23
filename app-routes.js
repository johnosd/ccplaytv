const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/App.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update Screen type
content = content.replace(/\| \{ name: 'movies' \}/, "| { name: 'movies'; source: SourceOut }");
content = content.replace(/\| \{ name: 'movie-detail'; movieId: string \}/, "| { name: 'movie-detail'; source: SourceOut; movieId: string }");
content = content.replace(/\| \{ name: 'series' \}/, "| { name: 'series'; source: SourceOut }");
content = content.replace(/\| \{ name: 'series-detail'; seriesId: string \}/, "| { name: 'series-detail'; source: SourceOut; seriesId: string }");

// Update ListHomeScreen onSelect
const oldOnSelect = `onSelect={(destination: ListDestination) =>
            // A Live TV precisa saber de qual fonte ler o catÃ¡logo; Filmes e
            // SÃ©ries ainda leem o mock e nÃ£o recebem a fonte.
            destination === 'live'
              ? goto({ name: 'live', source: screen.source })
              : goto({ name: destination })
          }`;
const newOnSelect = `onSelect={(destination: ListDestination) =>
            goto({ name: destination, source: screen.source } as Screen)
          }`;
content = content.replace(/onSelect=\{\(destination: ListDestination\) =>[\s\S]*?goto\(\{ name: destination \}\)\n          \}/, newOnSelect);

// Update movies screen rendering
content = content.replace(
  /case 'movies':\n      return <MoviesScreen onOpenMovie=\{\(movieId\) => goto\(\{ name: 'movie-detail', movieId \}\)\} onBack=\{back\} \/>/,
  "case 'movies':\n      return <MoviesScreen sourceId={screen.source.id} onOpenMovie={(movieId) => goto({ name: 'movie-detail', source: screen.source, movieId })} onBack={back} />"
);
content = content.replace(
  /case 'movie-detail':\n      return <MovieDetailScreen movieId=\{screen\.movieId\} onBack=\{back\} \/>/,
  "case 'movie-detail':\n      return <MovieDetailScreen sourceId={screen.source.id} movieId={screen.movieId} onBack={back} />"
);

// Update series screen rendering
content = content.replace(
  /case 'series':\n      return <SeriesScreen onOpenSeries=\{\(seriesId\) => goto\(\{ name: 'series-detail', seriesId \}\)\} onBack=\{back\} \/>/,
  "case 'series':\n      return <SeriesScreen sourceId={screen.source.id} onOpenSeries={(seriesId) => goto({ name: 'series-detail', source: screen.source, seriesId })} onBack={back} />"
);
content = content.replace(
  /case 'series-detail':\n      return <SeriesDetailScreen seriesId=\{screen\.seriesId\} onBack=\{back\} \/>/,
  "case 'series-detail':\n      return <SeriesDetailScreen sourceId={screen.source.id} seriesId={screen.seriesId} onBack={back} />"
);

fs.writeFileSync(file, content);

