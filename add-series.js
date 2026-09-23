const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/features/catalog/catalogApi.ts');
let content = fs.readFileSync(file, 'utf8');

const seriesHook = `
export function useSeries(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-items', sourceId, 'series'],
    queryFn: async () => {
      if (!sourceId) return { items: [], next_cursor: null }

      const categories = await listCategories(sourceId, 'series')
      const items = []

      for (const category of categories) {
        const series = await listChannels(sourceId, category.order, 0, category.count, 'series')
        for (const s of series) {
          items.push({
            id: String(s.id ?? ''),
            kind: 'series',
            name: s.name,
            original_group: s.group ?? null,
            published: true,
            playable: false,
          })
        }
      }

      return { items, next_cursor: null }
    },
    enabled: sourceId !== null,
  })
}
`;

if (!content.includes('useSeries(')) {
  content = content + '\n' + seriesHook;
  fs.writeFileSync(file, content);
}

