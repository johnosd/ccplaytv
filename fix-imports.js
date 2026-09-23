const fs = require('fs');

let file = 'tv-web/src/lib/catalog/xtreamConnector.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("import { logger } from '../logger'\\n", "import { logger } from '../logger';\n");
fs.writeFileSync(file, content);

file = 'tv-web/src/lib/catalog/importPipeline.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace("import { logger } from '../logger'\\n", "import { logger } from '../logger';\n");
fs.writeFileSync(file, content);

