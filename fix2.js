const fs = require('fs'); 
const file = 'tv-web/e2e/fontes-estado.mjs';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/Conclu.*da/g, 'conclu');
fs.writeFileSync(file, content);
