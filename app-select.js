const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/App.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/onSelect=\{\(destination: ListDestination\) =>[\s\S]*?\}\s*,\s*\)\s*\}/, 'onSelect={(destination: ListDestination) => goto({ name: destination, source: screen.source } as Screen)}');
fs.writeFileSync(file, content);

