const fs = require('fs');
const file = 'tv-web/src/lib/catalog/importPipeline.test.ts';
let content = fs.readFileSync(file, 'utf8');

const regex = /(if \(url\.includes\('get_live_streams'\)\) \{[\s\S]*?return Promise\.resolve\([\s\S]*?textResponse\(JSON\.stringify\(\[\{ name: 'ESPN', stream_id: 9, category_id: '1' \}\]\)\),[\s\S]*?\)\n        \})/;
const replacement = `$1
        if (url.includes('get_vod_categories')) {
          return Promise.resolve(textResponse(JSON.stringify([{ category_id: '10', category_name: 'Filmes' }])))
        }
        if (url.includes('get_vod_streams')) {
          return Promise.resolve(textResponse(JSON.stringify([{ name: 'Matrix', stream_id: 100, category_id: '10', stream_type: 'movie' }])))
        }
        if (url.includes('get_series_categories')) {
          return Promise.resolve(textResponse(JSON.stringify([{ category_id: '20', category_name: 'Series' }])))
        }
        if (url.includes('get_series')) {
          return Promise.resolve(textResponse(JSON.stringify([{ name: 'Breaking Bad', series_id: 200, category_id: '20' }])))
        }`;

content = content.replace(regex, replacement);

const assertionRegex = /(expect\(run\.channelsStored\)\.toBe\(1\))/;
const assertionReplacement = `expect(run.channelsStored).toBe(3) // 1 live, 1 vod, 1 series`;
content = content.replace(assertionRegex, assertionReplacement);

fs.writeFileSync(file, content);

