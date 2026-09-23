const fs = require('fs');
const file = '.planning/backlog.md';
let content = fs.readFileSync(file, 'utf8');

const newRow1 = '| 006-conector-xtream-vod-series | Conector Xtream JSON para VOD e Series | Convergida | 15/15 tasks | 2026-09-22 |\n';
const newRow2 = '| 007-higiene-credenciais | Higiene de Credenciais e Políticas de Rede | Convergida | 7/7 tasks | 2026-09-22 |\n';

content = content.replace('## Bugs', newRow1 + newRow2 + '\n## Bugs');

fs.writeFileSync(file, content);
