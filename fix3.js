const fs = require('fs');
const path = require('path');

const pPath = path.resolve('tv-web/src/lib/catalog/parity.test.ts');
let pContent = fs.readFileSync(pPath, 'utf8');
pContent = pContent.replace(/import \{.*?classifyEntry.*?\} from '\.\/db'/g, "import { classifyEntry } from './classifier'\nimport { CatalogItemKind } from './db'");
pContent = pContent.replace(/import \{ CatalogItemKind, classifyEntry \} from '\.\/db'/, "import { classifyEntry } from './classifier'\nimport { CatalogItemKind } from './db'");
fs.writeFileSync(pPath, pContent);

const srPath = path.resolve('tv-web/src/lib/catalog/sourceRepository.test.ts');
let srContent = fs.readFileSync(srPath, 'utf8');
srContent = srContent.replace(/groupOrder: 0,\n      \}/g, "groupOrder: 0,\n        kind: 'channel',\n      }");
fs.writeFileSync(srPath, srContent);

const hsPath = path.resolve('tv-web/src/features/home/HomeScreen.test.tsx');
let hsContent = fs.readFileSync(hsPath, 'utf8');
hsContent = hsContent.replace(/onOpenBench=\{.*?\}\n/g, '');
fs.writeFileSync(hsPath, hsContent);

