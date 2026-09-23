const fs = require('fs');
let file = 'tv-web/src/lib/catalog/userStateRepository.test.ts';
let content = fs.readFileSync(file, 'utf8');

const newTest = `
  it('should fetch global favorites across sources', async () => {
    await toggleFavorite(buildStableId('src1', 'movie', 'matrix'), 'src1', true)
    await toggleFavorite(buildStableId('src2', 'movie', 'avatar'), 'src2', true)
    await toggleFavorite(buildStableId('src1', 'movie', 'dune'), 'src1', false)

    const favs = await require('./userStateRepository').getGlobalFavorites()
    expect(favs).toHaveLength(2)
    expect(favs.map((f) => f.sourceId).sort()).toEqual(['src1', 'src2'])
  })

  it('should fetch continue watching across sources', async () => {
    await updateProgress(buildStableId('src1', 'movie', 'matrix'), 'src1', 120)
    await updateProgress(buildStableId('src2', 'movie', 'avatar'), 'src2', 300)

    const cw = await require('./userStateRepository').getContinueWatching()
    expect(cw).toHaveLength(2)
    expect(cw[0].lastWatched).toBeGreaterThanOrEqual(cw[1].lastWatched)
  })
`;

content = content.replace(/}\)\n?$/, newTest + '})\n');
fs.writeFileSync(file, content);
