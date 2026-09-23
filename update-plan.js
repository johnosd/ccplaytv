const fs = require('fs');
const file = 'sdd/specs/007-higiene-credenciais/plan.md';
let content = fs.readFileSync(file, 'utf8');

content += '\n\n## Resultado Final\nAs tarefas foram completamente implementadas. O helper `logger.ts` centraliza a higienização de credenciais, cobrindo URLs estruturadas (IPTV) e query parameters. Substituímos usos nativos de `console.warn`/`console.error` por `logger.warn`/`logger.error` no `xtreamConnector` e `importPipeline`, garantindo a aplicação do filtro. Os utilitários de fetch agora incluem o header User-Agent `VLC/3.0.0` embutido.\n';

content = content.replace(/O maior risco Ã©/g, 'Resolvido: O maior risco era');
content = content.replace(/O maior risco é/g, 'Resolvido: O maior risco era');

fs.writeFileSync(file, content);
