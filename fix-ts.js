const fs = require('fs');
const path = require('path');

// 1. parity.test.ts
const pPath = path.resolve('tv-web/src/lib/catalog/parity.test.ts');
let pContent = fs.readFileSync(pPath, 'utf8');
pContent = pContent.replace(/from '\.\/classifier'/g, "from './db'");
fs.writeFileSync(pPath, pContent);

// 2. sourceRepository.test.ts
const srPath = path.resolve('tv-web/src/lib/catalog/sourceRepository.test.ts');
let srContent = fs.readFileSync(srPath, 'utf8');
srContent = srContent.replace(/groupOrder: 0,\n      \}/g, "groupOrder: 0,\n        kind: 'channel',\n      }");
fs.writeFileSync(srPath, srContent);

// 3. xtreamConnector.test.ts
const xtPath = path.resolve('tv-web/src/lib/catalog/xtreamConnector.test.ts');
let xtContent = fs.readFileSync(xtPath, 'utf8');
xtContent = xtContent.replace(', buildVodUrl', '');
xtContent = xtContent.replace(/const status = \{ authorized: true, expired: false, allowedFormats: \['m3u8'\] \}\n/g, '');
fs.writeFileSync(xtPath, xtContent);

// 4. HomeScreen.test.tsx
const hsPath = path.resolve('tv-web/src/features/home/HomeScreen.test.tsx');
if (fs.existsSync(hsPath)) {
  let hsContent = fs.readFileSync(hsPath, 'utf8');
  hsContent = hsContent.replace(/onOpenBench=\{.*?\}/g, '');
  fs.writeFileSync(hsPath, hsContent);
}

console.log('Fixed TS errors.');

