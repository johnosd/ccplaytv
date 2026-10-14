# Bug Fix: Lista Xtream não traz filmes/séries/canais novos ao abrir o app

- **Slug**: lista-xtream-nao-atualiza-novos-filmes
- **Corrigido**: 2026-10-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Abrir uma lista agora dispara a atualização em segundo plano sempre que a
última sincronização bem-sucedida tem mais de 10 min (antes: 24 h), e voltar o
app residente ao primeiro plano faz a mesma verificação. A atualização usa o
caminho incremental que já existia (feature 038): categorias novas entram,
removidas saem, mantidas ganham renovação pendente e a pré-carga renova os
itens sem bloquear a navegação.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/catalog/freshness.ts` | modified | Novo `REFRESH_ON_OPEN_MIN_MS` (10 min); `decideOnOpen` usa-o no lugar de `STALE_AFTER_MS`. `isCategoryFresh` segue com 24 h (comentário atualizado: rede de segurança de sessão longa). |
| `tv-web/src/features/import/useRefreshOnForeground.ts` | added | `shouldCheckOnForeground` (regra pura) + `useRefreshOnForeground` (ouvinte de `visibilitychange`). Não pergunta sem lista ativa, com sincronização em andamento, com conta guardada vencida/recusada (`accessFromAccount`) ou dentro de 10 min da última verificação do gatilho. |
| `tv-web/src/App.tsx` | modified | O `openSource.mutate` de `enterSource` virou `checkSourceForUpdates`, reusado pelo gatilho de primeiro plano. 624 linhas (teto 625). |
| `sdd/specs/004-conector-xtream-live/spec.md` | modified | Emenda inline à FR-020 com o novo prazo (texto original preservado). |

## Tests Added or Updated

- `tv-web/src/lib/catalog/freshness.test.ts::dispara update_by_age ao abrir uma lista sincronizada há mais de 10 min, mesmo dentro de 24 h` — trava o bug: 11 min, 1 h e 23h59 → `update_by_age`; 5 min → `none`.
- `tv-web/src/lib/catalog/freshness.test.ts::não dispara nada se sincronizou há menos do intervalo mínimo` — ajustado do antigo "dentro do prazo (24 h)".
- `tv-web/src/features/import/useRefreshOnForeground.test.tsx` (6 casos) — regra pura (lista ativa, sincronizando, conta vencida/recusada, intervalo mínimo) e o hook (verifica ao voltar ao primeiro plano, uma vez por intervalo; não verifica sem lista ou sincronizando).

## Local Verification

- `npx vitest run src/lib/catalog/freshness.test.ts` → 12/12.
- `npx vitest run src/features/import/useRefreshOnForeground.test.tsx` → 6/6.
- `npx vitest run src/App src/features/import src/lib/catalog/{freshness,importPipeline.atualizacao,catalogRepository.atualizacao,prefetch,categoryLoader}` → 31 arquivos, 167 testes, todos passando.
- `npm run test` (suíte inteira) → 507 arquivos, 3059 testes, todos passando.
- `npx tsc -b` → sem erros. `npm run lint` → ok (só avisos pré-existentes; `App.tsx` 624 < teto 625).
- Não executado: E2E (`npm run test:e2e`, exige `npm run dev`) nem reprodução contra o provedor real/TV física — ficam para a fase Test.

## Deviations from Assessment

- O gatilho de primeiro plano usa `accessFromAccount` (só a conta guardada),
  não `decideSourceAccess`: este devolve `check` quando a verificação da conta
  tem mais de 24 h, e voltar ao app não deve abrir a tela de acesso por conta
  própria nem deixar de atualizar por isso. Conta vencida/recusada continua
  bloqueando, como o assessment pedia.
- A ação continua `'update_by_age'` (renomear era opcional) — `importApi.ts`
  não mudou.
- O teste do gatilho ficou em `features/import/` junto do hook, não junto do
  `App`.

## Follow-ups

- Fase Test: rodar `npm run test:e2e` (com `npm run dev`) e, idealmente, o
  `tizen-tv` para medir na TV física o custo de atualizar a cada abertura
  (downloads por seção + gravação; ver "disco cheio" da 065).
- Ideia para o backlog (fora deste bug): frequência de atualização
  configurável, e só marcar renovação nas categorias cuja contagem mudou.
