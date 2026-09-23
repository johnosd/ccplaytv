const fs = require('fs');
const path = require('path');
const file = path.resolve('tv-web/src/lib/catalog/xtreamConnector.test.ts');
let content = fs.readFileSync(file, 'utf8');

// replace fetchMock with vi.stubGlobal
content = content.replace(/fetchMock\.mockResponse\(\(req\) => \{/g, 'vi.stubGlobal(\'fetch\', vi.fn().mockImplementation(async (req) => {');

content = content.replace(/const url = new URL\(req\.url\)/g, 'const url = new URL(typeof req === \'string\' ? req : req.url)');

content = content.replace(/return Promise\.resolve\(JSON\.stringify\(([\s\S]*?)\)\)/g, 'return jsonResponse($1)');
content = content.replace(/return Promise\.reject\(new Error\('Unknown action'\)\)/g, 'return new Response(null, { status: 404 })');

fs.writeFileSync(file, content);

