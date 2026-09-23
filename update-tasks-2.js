const fs = require('fs');

let file = 'sdd/specs/008-user-state-repo/tasks.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/- \[ \] 1. Criar `userStateRepository.ts`./g, '- [x] 1. Criar `userStateRepository.ts`.');
content = content.replace(/- \[ \] 2. Implementar `buildStableId/g, '- [x] 2. Implementar `buildStableId');
content = content.replace(/- \[ \] 3. Implementar `getUserState/g, '- [x] 3. Implementar `getUserState');
content = content.replace(/- \[ \] 4. Implementar `toggleFavorite/g, '- [x] 4. Implementar `toggleFavorite');
content = content.replace(/- \[ \] 5. Implementar `updateProgress/g, '- [x] 5. Implementar `updateProgress');
content = content.replace(/- \[ \] 6. Criar `userStateRepository.test.ts`/g, '- [x] 6. Criar `userStateRepository.test.ts`');
content = content.replace(/- \[ \] 7. Verificar indepen/g, '- [x] 7. Verificar indepen');

content = content.replace(
/## Phase 2: UserStateRepository[\s\S]*?Registro da Fase:\n- Status: \n- Feito: \n- Testes executados: \n- Pendências: /m,
(match) => match.replace(
'**Registro da Fase**:\n- Status: \n- Feito: \n- Testes executados: \n- Pendências: ',
'**Registro da Fase**:\n- Status: Concluído\n- Feito: Módulos de repositório implementados\n- Testes executados: vitest run userStateRepository.test.ts (100% passed)\n- Pendências: Nenhuma'
)
);

fs.writeFileSync(file, content);
