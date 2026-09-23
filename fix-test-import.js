const fs = require('fs');
let file = 'tv-web/src/lib/catalog/userStateRepository.test.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/require\('\.\/userStateRepository'\)\./g, '');
content = content.replace(/updateProgress,/g, 'updateProgress,\n  getGlobalFavorites,\n  getContinueWatching,');

fs.writeFileSync(file, content);
