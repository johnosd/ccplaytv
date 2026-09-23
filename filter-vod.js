const fs = require('fs');
const file = 'tv-web/src/lib/catalog/xtreamConnector.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const ext = typeof raw\.container_extension === 'string' \? raw\.container_extension : 'mp4'/,
  "const ext = typeof raw.container_extension === 'string' ? raw.container_extension : 'mp4'\n  if (typeof raw.stream_type === 'string' && raw.stream_type !== 'movie') return undefined"
);

fs.writeFileSync(file, content);

