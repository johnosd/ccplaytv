const fs = require('fs');

let file = 'tv-web/src/lib/catalog/xtreamConnector.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/console\.warn/g, 'logger.warn');
content = content.replace(/console\.error/g, 'logger.error');
content = content.replace(/console\.log/g, 'logger.log');
fs.writeFileSync(file, content);

file = 'tv-web/src/lib/catalog/importPipeline.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace(/console\.warn/g, 'logger.warn');
content = content.replace(/console\.error/g, 'logger.error');
content = content.replace(/console\.log/g, 'logger.log');
fs.writeFileSync(file, content);

file = 'tv-web/src/lib/catalog/importPipeline.test.ts';
content = fs.readFileSync(file, 'utf8');
content = content.replace(/listChannels\(M3U_SOURCE\.id, 0, 0, 10, database\)/g, 'listChannels(M3U_SOURCE.id, 0, 0, 10, undefined, database)');
content = content.replace(/listChannels\(M3U_SOURCE\.id, 0, 0, 1, database\)/g, 'listChannels(M3U_SOURCE.id, 0, 0, 1, undefined, database)');
content = content.replace(/listChannels\(PROVIDER_SOURCE\.id, 0, 0, 1, database\)/g, 'listChannels(PROVIDER_SOURCE.id, 0, 0, 1, undefined, database)');
content = content.replace(/listCategories\(M3U_SOURCE\.id, database\)/g, 'listCategories(M3U_SOURCE.id, undefined, database)');
content = content.replace(/countChannels\(M3U_SOURCE\.id, undefined, database\)/g, 'countChannels(M3U_SOURCE.id, undefined, undefined, database)');
// Fix the mock database inserts missing "kind"
content = content.replace(/database\.channels\.add\(\{([^}]+)\}\)/g, "database.channels.add({kind: 'channel', $1})");

fs.writeFileSync(file, content);

