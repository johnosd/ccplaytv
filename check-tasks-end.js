const fs = require('fs');
let file = 'sdd/specs/008-user-state-repo/tasks.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('- [ ] 8. Em `db.ts`', '- [x] 8. Em `db.ts`');
content = content.replace('- [ ] 9. Em `userStateRepository.ts`', '- [x] 9. Em `userStateRepository.ts`');
content = content.replace('- [ ] 10. Atualizar testes', '- [x] 10. Atualizar testes');

content = content.replace(
"**Registro da Fase**:\n- Status: Em Andamento\n- Feito: Operações básicas implementadas\n- Testes executados: vitest (parcial)\n- Pendências: Adicionar índices e queries globais baseados nas referências UI",
"**Registro da Fase**:\n- Status: Concluído\n- Feito: Queries globais adicionadas\n- Testes executados: vitest (100% passed)\n- Pendências: Nenhuma"
);

fs.writeFileSync(file, content);
