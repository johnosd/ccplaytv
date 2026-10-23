# Bug Verification: CH+/CH− não trocam canal no player

- **Slug**: ch-mais-menos-nao-trocam-canal
- **Testado**: 2026-10-22
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Encerrado em 2026-10-22 após confirmação do usuário na TV física: todos os itens do [roteiro único](../ROTEIRO-TV-2026-10-22.md) foram validados com sucesso. No item 2, troca de canal por CH+/CH− e saída por RETURN foram aprovadas com os painéis fechados e um canal intermediário.

A evidência física é o relato do usuário. Esta atualização é documental; os testes automatizados abaixo não foram reexecutados.

### Registro anterior — 2026-10-11

Defeito na permissão de registro reproduzido pelo teste do manifesto antes do patch e eliminado depois. Testes de encaminhamento das teclas, player, Live e arquivo passaram. O sintoma relatado na TV física ainda precisa ser repetido após atualização do pacote; não se atribui à TV o resultado dos testes simulados.

## Checks Performed

Comandos abaixo executados em `tv-web/`, usando o `node.exe` instalado em `G:\Program Files\nodejs\node.exe`.

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução do defeito de manifesto antes do patch | `node node_modules/vitest/vitest.mjs run scripts/tizenInputPrivilege.test.mjs` | fail esperado | 1/1 falhou: permissão oficial ausente; exit 1 |
| Reprodução automatizada pós-fix e regressão | `node node_modules/vitest/vitest.mjs run scripts/tizenInputPrivilege.test.mjs src/lib/tizenMediaKeys.test.ts src/components/PlayerLayer.test.tsx src/components/PlayerLayer.guide.test.tsx src/features/live/LiveScreen.test.tsx src/features/live/LiveScreen.archive.test.tsx` | pass | 6 arquivos / 165 testes, exit 0; inclui manifesto, códigos sem nome, guia e vizinho ao vivo a partir de arquivo |
| Lint / arquitetura | `node node_modules/oxlint/bin/oxlint` e `node scripts/architecture.mjs` | pass | Exit 0; avisos na árvore atual; catraca sem erro |
| Type-check | `node node_modules/typescript/bin/tsc -b` | pass | Exit 0 |
| Build | `node node_modules/vite/bin/vite.js build` e `node scripts/check-no-demux-in-build.mjs` | pass | Exit 0; nenhum marcador de demuxer |
| TV física | `sdb devices`; roteiro do assessment | not-run | Nenhum dispositivo conectado; sem instalação nesta sessão |
| E2E de navegador | Não executado | skipped | Mudança de produção restrita ao manifesto; navegador não aplica a permissão Tizen. Nenhum pedido de deploy foi realizado |

## Output Excerpts

Antes do patch: `expected [...] to include 'http://tizen.org/privilege/tv.inputdevice'`.

Depois do patch: `Test Files 6 passed (6)` / `Tests 165 passed (165)`.

`architecture: ok` / `check-no-demux-in-build: ok`.

## Residual Risks

Registro de 2026-10-11: a pendência de confirmação de CH+/CH− no aparelho foi encerrada pela validação de 2026-10-22. As notas abaixo descrevem as condições e os limites da verificação anterior.

- Falta confirmar no aparelho que o registro passa a entregar CH+/CH− ao app. Não foi capturado o erro de permissão na instalação antiga.
- Guia, lista de zapping, painéis e estados de preparação mantêm as políticas existentes; não houve mudança especulativa nesses caminhos.
- Atualização exige instalar novamente o pacote com a permissão correta, preservando dados locais. Apenas gerar o frontend não modifica o aplicativo instalado.
- A árvore já continha alterações de outras tarefas; resultados de lint/build refletem esse estado atual. A correção não alterou tais arquivos.

## Recommendation

Fechar como `verified`, conforme validação física e autorização expressa do usuário em 2026-10-22: "Todos os itens foram validados com sucesso. Podem fechar todos esses bugs".

### Recomendação anterior — 2026-10-11

Segurar o aceite físico: instalar a atualização sem desinstalar, reproduzir canal intermediário com camadas fechadas, confirmar CH+ e CH− e RETURN. Correção local aplicada e testes verdes; manter `partial` até confirmação no aparelho.
