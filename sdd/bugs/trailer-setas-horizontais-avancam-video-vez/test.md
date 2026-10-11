# Bug Verification: Trailer: setas horizontais

- **Slug**: trailer-setas-horizontais-avancam-video-vez
- **Testado**: 2026-10-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Correção aplicada; reprodução equivalente automatizada passou. Antes: 4 falhas/40 casos, sendo duas do Live e duas do trailer. Depois: 42/42 nos três arquivos dos bugs; suíte ampliada 445/445 (61 arquivos); E2E 4/4. Partial exclusivamente porque o sintoma relatado na TV física não foi rerodado no aparelho.

## Checks Performed

Comandos executados em tv-web, diretamente com node (equivalentes aos scripts npm).

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução e regressões | node node_modules/vitest/vitest.mjs run src/lib/player/avplayAdapter.test.ts src/components/TrailerLayer.test.tsx src/components/PlayerLayer.avplay-loading.test.tsx | pass | 42/42; rerodado na fase Test |
| Suite relevante | node node_modules/vitest/vitest.mjs run src/lib/player src/components/PlayerLayer src/components/TrailerLayer.test.tsx src/lib/trailer | pass | 445 testes / 61 arquivos |
| Navegador | node e2e/run.mjs --only trailers,zapping-live-tv,ciclo-vida-player,rede-lifecycle-erros --jobs 2 | pass | 4/4, app + ponte real, motor YouTube fictício, sem serviços reais |
| TypeScript | node node_modules/typescript/bin/tsc -b | pass | exit 0 |
| Lint | node node_modules/oxlint/bin/oxlint | pass | zero erros, 76 avisos na árvore atual |
| Arquitetura | node scripts/architecture.mjs | pass | inicialmente max-lines; após resumir comentários, 593 linhas, teto 593; nenhum baseline alterado |
| Build | node node_modules/vite/bin/vite.js build | pass | exit 0, após TypeScript |
| Demux fora do build | node scripts/check-no-demux-in-build.mjs | pass | nenhum marcador |
| Diff | git diff --check -- arquivos afetados | pass | avisos de normalização CRLF apenas |
| TV física | Repetir o relato com canal/trailer real e controle Samsung | not-run | nenhum deploy solicitado/feito |

## Output Excerpts

- Antes: 4 failed / 36 passed. Live manteve player-status-label Carregando…; trailer enviou seek-by com seconds: 10.
- Depois: 42 passed; 445 passed; 4/4 scripts passaram.
- Evidência completa: [antes](evidencias/reproducao-antes.txt), [verificação](evidencias/verificacao.txt).

## Residual Risks

Navegação e protocolo verificados em Chromium e jsdom; YouTube/controle físico na TV não testados. Confirmar ←/→ entre Pausar/Continuar e Minha Lista sem salto; SELECT só ativa o botão; RETURN fecha e restaura o foco no detalhe.

Suite completa do repositório não executada: foram usados os testes relevantes de player/trailer e quatro roteiros E2E. Alterações locais anteriores preservadas; dados da TV não foram tocados.

## Recommendation

Manter correção aplicada; segurar encerramento físico até repetir o cenário original na TV. Nenhum bug permaneceu reproduzível na validação automatizada. Commit sugerido: fix(player): corrigir carregamento do Live e foco dos trailers.
