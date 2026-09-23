const fs = require('fs');
const file = 'tv-web/src/lib/catalog/xtreamConnector.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const streamId = raw\.stream_id === undefined \|\| raw\.stream_id === null \? undefined : String\(raw\.stream_id\)/,
  "if (typeof raw.stream_type === 'string' && raw.stream_type !== 'live') return undefined\n  const streamId = raw.stream_id === undefined || raw.stream_id === null ? undefined : String(raw.stream_id)"
);

fs.writeFileSync(file, content);

