const fs = require('fs');

let file = 'tv-web/src/lib/catalog/xtreamConnector.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("import { logger } from '../logger';\n", ""); // Remove unused logger since we didn't use console.warn in xtreamConnector.ts
fs.writeFileSync(file, content);

file = 'tv-web/src/lib/catalog/importPipeline.test.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace(/name: 'Canal Antigo',/g, "kind: 'channel',\n      name: 'Canal Antigo',");
fs.writeFileSync(file, content);

