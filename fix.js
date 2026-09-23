const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/lib/catalog/xtreamConnector.test.ts');
let content = fs.readFileSync(file, 'utf8');

// The bad line was inserted at line 12. Let's just find and replace it.
content = content.replace(/,\s*acquireXtreamVod,\s*acquireXtreamSeries,\s*fetchSeriesInfo,\s*buildVodUrl\}\s*from\s*'\.\/xtreamConnector'/g, '');

// Prepend the new import
content = "import { acquireXtreamVod, acquireXtreamSeries, fetchSeriesInfo, buildVodUrl } from './xtreamConnector';\n" + content;

fs.writeFileSync(file, content);

