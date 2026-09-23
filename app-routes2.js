const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/App.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<MoviesScreen onOpenMovie=\{\(movieId\) => goto\(\{ name: 'movie-detail', movieId \}\)\} onBack=\{back\} \/>/g,
  "<MoviesScreen sourceId={screen.source.id} onOpenMovie={(movieId) => goto({ name: 'movie-detail', source: screen.source, movieId } as Screen)} onBack={back} />"
);

content = content.replace(
  /<MovieDetailScreen movieId=\{screen\.movieId\} onBack=\{back\} \/>/g,
  "<MovieDetailScreen sourceId={screen.source.id} movieId={screen.movieId} onBack={back} />"
);

content = content.replace(
  /<SeriesScreen\s*onOpenSeries=\{\(seriesId\) => goto\(\{ name: 'series-detail', seriesId \}\)\}\s*onBack=\{back\}\s*\/>/m,
  "<SeriesScreen sourceId={screen.source.id} onOpenSeries={(seriesId) => goto({ name: 'series-detail', source: screen.source, seriesId } as Screen)} onBack={back} />"
);

content = content.replace(
  /<SeriesDetailScreen seriesId=\{screen\.seriesId\} onBack=\{back\} \/>/g,
  "<SeriesDetailScreen sourceId={screen.source.id} seriesId={screen.seriesId} onBack={back} />"
);

fs.writeFileSync(file, content);

