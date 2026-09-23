const fs = require('fs');
let file = 'tv-web/src/lib/catalog/userStateRepository.ts';
let content = fs.readFileSync(file, 'utf8');

const newMethods = `
export async function getGlobalFavorites(
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  // Returns all favorites across all sources, sorted by when they were updated
  return database.userStates
    .where('isFavorite')
    .equals('true') // Wait, dexie boolean indexing: Dexie indexes booleans as 1/0 or just exact match. Actually Dexie indexes booleans perfectly fine in recent versions, so .equals(true) works, or we can use .filter if needed. But in Dexie, we should just use .filter if we are not sure, or .where('isFavorite').equals(1). Let's just use .filter to be safe across Dexie versions if boolean index is quirky.
    // Let's use simple filtering on a full scan since it's local, or better:
    // Actually, in Dexie 3+, booleans are indexed as 1 or 0 usually, but let's use .filter to be absolutely safe:
    .filter(state => state.isFavorite === true)
    .reverse()
    .sortBy('updatedAt') // Wait, sortBy requires index. Let's just fetch and sort in memory.
}
`;
// Let's write the methods properly.

const properMethods = `
export async function getGlobalFavorites(
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  const all = await database.userStates.toArray()
  return all.filter(s => s.isFavorite).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getContinueWatching(
  database: CatalogDb = db,
): Promise<UserStateRecord[]> {
  const all = await database.userStates.toArray()
  return all.filter(s => s.progressSeconds !== undefined && s.progressSeconds > 0)
            .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))
}
`;

content += '\n' + properMethods;
fs.writeFileSync(file, content);
