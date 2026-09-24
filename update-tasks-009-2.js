const fs = require('fs');
let file = 'sdd/specs/009-virtualizacao-foco/tasks.md';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('- [ ] 1. Em `tv-web/src/lib/focus/virtualFocusHelper.ts`', '- [X] 1. Em `tv-web/src/lib/focus/virtualFocusHelper.ts`');
content = content.replace('- [ ] 2. Implementar a lógica', '- [X] 2. Implementar a lógica');
content = content.replace('- [ ] 3. Disparar `virtualizer.scrollToIndex(proximo)`', '- [X] 3. Disparar `virtualizer.scrollToIndex(proximo)`');
content = content.replace('- [ ] 4. Agendar (`requestAnimationFrame`', '- [X] 4. Agendar (`requestAnimationFrame`');
content = content.replace('- [ ] 5. Testar a lógica matemática e de clamping', '- [X] 5. Testar a lógica matemática e de clamping');

content = content.replace(
/## Phase 2: VirtualFocus Helper[\s\S]*?Registro da Fase:\n- Status: \n- Feito: \n- Testes executados: \n- Pendências: /m,
(match) => match.replace(
"**Registro da Fase**:\n- Status: \n- Feito: \n- Testes executados: \n- Pendências: ",
"**Registro da Fase**:\n- Status: Concluído\n- Feito: Helper de foco direcional escrito\n- Testes executados: vitest virtualFocusHelper.test.ts passou\n- Pendências: Nenhuma"
)
);

fs.writeFileSync(file, content);

