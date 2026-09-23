const fs = require('fs');

let f1 = 'tv-web/src/lib/catalog/parity.test.ts';
let d1 = fs.readFileSync(f1, 'utf8');
d1 = d1.replace(/import \{ CatalogItemKind, classifyEntry \} from '\.\/classifier'/, "import { classifyEntry } from './classifier'\nimport type { CatalogItemKind } from './db'");
fs.writeFileSync(f1, d1);

let f2 = 'tv-web/src/lib/catalog/sourceRepository.test.ts';
let d2 = fs.readFileSync(f2, 'utf8');
d2 = d2.replace(/groupOrder: 0,\n      \}/g, "groupOrder: 0,\n        kind: 'channel',\n      }");
fs.writeFileSync(f2, d2);

let f3 = 'tv-web/src/features/home/HomeScreen.test.tsx';
let d3 = fs.readFileSync(f3, 'utf8');
d3 = d3.replace(/onOpenBench=\{.*?\}\n/g, '');
fs.writeFileSync(f3, d3);

