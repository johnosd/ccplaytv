const fs = require('fs');

let file = 'sdd/specs/008-user-state-repo/tasks.md';
let content = fs.readFileSync(file, 'utf8');

const newTasks = `- [ ] 8. Em \`db.ts\`, adicionar índices \`isFavorite\` e \`lastWatched\` à store \`userStates\` (necessário para os rails 'Continue Watching' e 'Favorites' do iptvnator).
- [ ] 9. Em \`userStateRepository.ts\`, implementar \`getGlobalFavorites(db)\` e \`getContinueWatching(db)\`.
- [ ] 10. Atualizar testes para cobrir as novas queries.
`;

content = content.replace('- [x] 7. Verificar independência', '- [x] 7. Verificar independência\n' + newTasks);

content = content.replace(
"**Registro da Fase**:\n- Status: Concluído\n- Feito: Módulos de repositório implementados\n- Testes executados: vitest run userStateRepository.test.ts (100% passed)\n- Pendências: Nenhuma",
"**Registro da Fase**:\n- Status: Em Andamento\n- Feito: Operações básicas implementadas\n- Testes executados: vitest (parcial)\n- Pendências: Adicionar índices e queries globais baseados nas referências UI"
);

fs.writeFileSync(file, content);
