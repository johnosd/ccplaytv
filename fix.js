const fs = require('fs'); 
const file = 'tv-web/e2e/fontes-estado.mjs';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('X dias"\')\'', 'X dias"\')');
fs.writeFileSync(file, content);
