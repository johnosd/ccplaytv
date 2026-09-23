const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/features/catalog/catalogApi.ts');
let content = fs.readFileSync(file, 'utf8');

const newHook = `
export function useMovies(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'movie'],
    queryFn: async () => {
      if (!sourceId) return { items: [], next_cursor: null }

      const categories = await listCategories(sourceId, 'movie')
      const items = []

      for (const category of categories) {
        const movies = await listChannels(sourceId, category.order, 0, category.count, 'movie')
        for (const movie of movies) {
          items.push({
            id: String(movie.id ?? ''),
            kind: 'movie',
            name: movie.name,
            original_group: movie.group ?? null,
            published: true,
            playable: Boolean(movie.directUrl) || Boolean(movie.providerStreamId),
          })
        }
      }

      return { items, next_cursor: null }
    },
    enabled: sourceId !== null,
  })
}
`;
content = content + '\n' + newHook;
fs.writeFileSync(file, content);

