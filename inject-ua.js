const fs = require('fs');

let file = 'tv-web/src/lib/catalog/xtreamConnector.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace("response = await fetch(url)", "response = await fetch(url, { headers: { 'User-Agent': 'VLC/3.0.0' } })");
fs.writeFileSync(file, content);

file = 'tv-web/src/lib/catalog/m3uParser.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace("const response = await fetch(url)", "const response = await fetch(url, { headers: { 'User-Agent': 'VLC/3.0.0' } })");
fs.writeFileSync(file, content);

