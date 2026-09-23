const fs = require('fs');
const path = require('path');

// 1. Fix Bug 1: catalogApi.ts
const apiPath = path.resolve('tv-web/src/features/catalog/catalogApi.ts');
let apiCode = fs.readFileSync(apiPath, 'utf8');
apiCode = apiCode.replace(/listCategories\(sourceId\)/, "listCategories(sourceId, 'channel')");
apiCode = apiCode.replace(/listChannels\(sourceId, category\.order, 0, category\.count\)/, "listChannels(sourceId, category.order, 0, category.count, 'channel')");
fs.writeFileSync(apiPath, apiCode);

// 2. Fix Bug 2: importPipeline.ts
const pipePath = path.resolve('tv-web/src/lib/catalog/importPipeline.ts');
let pipeCode = fs.readFileSync(pipePath, 'utf8');

// Change batch size
pipeCode = pipeCode.replace(/const DEFAULT_BATCH_SIZE = 500/, 'const DEFAULT_BATCH_SIZE = 2500');

// Replace sequential acquire with Promise.all
const seqStart = /const result = await acquireXtreamChannels\([\s\S]*?\} catch \(error\) \{[\s\S]*?console\.warn\('Erro isolado ao importar series via painel', error\)\n\s*\}/;

const parallelReplacement = `const resultPromise = acquireXtreamChannels(
          credential.dns,
          credential.username,
          credential.password,
          status,
        )
        const vodsPromise = acquireXtreamVod(credential.dns, credential.username, credential.password).catch((e) => {
          console.warn('Erro isolado ao importar VOD via painel', e)
          return []
        })
        const seriesPromise = acquireXtreamSeries(credential.dns, credential.username, credential.password).catch((e) => {
          console.warn('Erro isolado ao importar series via painel', e)
          return []
        })

        const [result, vods, series] = await Promise.all([resultPromise, vodsPromise, seriesPromise])
        mode = 'xtream_api'
        enterStep('parsing')
        await persist()

        for (const channel of result.channels) {
          if (cancelled) throw new ImportCancelledError()
          await accept(channel)
        }
        for (const vod of vods) {
          if (cancelled) throw new ImportCancelledError()
          await accept(vod)
        }
        for (const s of series) {
          if (cancelled) throw new ImportCancelledError()
          await accept(s)
        }`;

pipeCode = pipeCode.replace(seqStart, parallelReplacement);
fs.writeFileSync(pipePath, pipeCode);

