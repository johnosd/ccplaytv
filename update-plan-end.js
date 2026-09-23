const fs = require('fs');

let file = 'sdd/specs/008-user-state-repo/plan.md';
let content = fs.readFileSync(file, 'utf8');

content += `
## Estado Atual
| Área | Estado |
|---|---|
| Repositório | Implementado e Testado |
| DB | Schema v4 criado |

## Arquivos Principais
- \`tv-web/src/lib/catalog/db.ts\`
- \`tv-web/src/lib/catalog/userStateRepository.ts\`

## Execution Notes
| Data | Fase/Story | Resumo | Pendência Principal |
|---|---|---|---|
| 2026-09-22 | Phase 1-3 | Repositório Dexie de estado criado | Nenhuma |

PRÓXIMO: sdd-converge
`;

fs.writeFileSync(file, content);
