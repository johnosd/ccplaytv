const fs = require('fs');
let file = 'sdd/specs/008-user-state-repo/tasks.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/- \[ \] Phase 1 testada/g, '- [x] Phase 1 testada');
content = content.replace(/- \[ \] Phase 2 testada/g, '- [x] Phase 2 testada');
content = content.replace(/- \[ \] Testes no console/g, '- [x] Testes no console');

content = content.replace(
/## Phase 3: Polish[\s\S]*?Registro da Fase:\n- Status: \n- Feito: \n- Testes executados: \n- Pendências: /m,
(match) => match.replace(
'**Registro da Fase**:\n- Status: \n- Feito: \n- Testes executados: \n- Pendências: ',
'**Registro da Fase**:\n- Status: Concluído\n- Feito: Tudo OK\n- Testes executados: Todos no vitest\n- Pendências: Nenhuma'
)
);

fs.writeFileSync(file, content);

