const fs = require('fs');
const path = require('path');

// 1. importPipeline.ts
const ipPath = path.resolve('tv-web/src/lib/catalog/importPipeline.ts');
let ipContent = fs.readFileSync(ipPath, 'utf8');

// Add imports
ipContent = ipContent.replace(
  'acquireXtreamChannels,\n  classifyWithGroupOrder',
  'acquireXtreamChannels,\n  acquireXtreamVod,\n  acquireXtreamSeries,\n  classifyWithGroupOrder'
);

// Modify accept() to only discard unclassified
ipContent = ipContent.replace(
  /if \(channel\.kind !== 'channel'\) \{/,
  'if (channel.kind === \'unclassified\') {'
);

// Inject acquireXtreamVod and acquireXtreamSeries after channels
const newFlow = `          await accept(channel)
        }

        try {
          const vods = await acquireXtreamVod(credential.dns, credential.username, credential.password)
          for (const vod of vods) {
            if (cancelled) throw new ImportCancelledError()
            await accept(vod)
          }
        } catch (error) {
          console.warn('Erro isolado ao importar VOD via painel', error)
        }

        try {
          const series = await acquireXtreamSeries(credential.dns, credential.username, credential.password)
          for (const s of series) {
            if (cancelled) throw new ImportCancelledError()
            await accept(s)
          }
        } catch (error) {
          console.warn('Erro isolado ao importar series via painel', error)
        }`;

ipContent = ipContent.replace(
  /          await accept\(channel\)\n        \}/,
  newFlow
);

fs.writeFileSync(ipPath, ipContent);

// 2. importPipeline.test.ts
const iptPath = path.resolve('tv-web/src/lib/catalog/importPipeline.test.ts');
let iptContent = fs.readFileSync(iptPath, 'utf8');

iptContent = iptContent.replace(
  /grava s. canais e contabiliza o que descartou \(FR-008\)/,
  'grava todos os tipos de mídia e descarta apenas os não classificados (v2)'
);
iptContent = iptContent.replace(
  /expect\(run\.channelsStored\)\.toBe\(2\)/g,
  'expect(run.channelsStored).toBe(4)' 
);
iptContent = iptContent.replace(
  /expect\(run\.discardedByType\)\.toBe\(2\)/g,
  'expect(run.discardedByType).toBe(0)'
);
iptContent = iptContent.replace(
  /expect\(await countChannels\(M3U_SOURCE\.id, undefined, undefined, database\)\)\.toBe\(2\)/g,
  'expect(await countChannels(M3U_SOURCE.id, undefined, undefined, database)).toBe(4)'
);

iptContent = iptContent.replace(
  /expect\(categories\.map\(\(category\) => category\.name\)\)\.toEqual\(\[\n      'Canais \| Esportes',\n      'Canais \| Variedades',\n    \]\)/,
  `expect(categories.map((category) => category.name)).toEqual([
      'Canais | Esportes',
      'Canais | Variedades',
      'Filmes',
      'Series'
    ])`
);

fs.writeFileSync(iptPath, iptContent);

