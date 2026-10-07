# Bug Fix: Teste de conexão não guarda resultado na TV

- **Slug**: teste-conexo-armazenamento-indisponvel-tv
- **Corrigido**: 2026-10-07
- **Assessment**: ./assessment.md
- **Status**: partial

## Summary

Instrumentação aplicada: o aviso do diálogo informa operação e categoria da falha por código definido no app. A causa da indisponibilidade na TV ainda não foi identificada; a persistência física não está declarada corrigida.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/lib/network/storageFailure.ts` | added | Lista fechada de categorias; `NET-R-*` leitura, `NET-W-*` escrita, `NET-D-*` exclusão. Até três níveis de `inner` do Dexie; desconhecidos viram `UNKNOWN`. Nunca retorna texto bruto. |
| `tv-web/src/lib/network/speedTestRepository.ts` | modified | Callback opcional `onUnavailable`; mantém retornos e exceções sanitizadas existentes. |
| `tv-web/src/features/settings/useSpeedTest.ts` | modified | Encaminha código da leitura/escrita, mantém medição e limpa código após compromisso bem-sucedido. |
| `tv-web/src/features/settings/SpeedTestDialog.tsx` | modified | Código junto ao aviso já traduzido; estilos e ações existentes. |
| Testes correspondentes e `tv-web/e2e/teste-conexao-tv.mjs` | modified/added | Classificação, privacidade, preservação de resultado, limpeza do código e navegação. |
| `CCPlayTv/assets/` | regenerated | Build de produção pelo deploy, sem alterar esquema/configuração de empacotamento. |

## Tests Added or Updated

- `storageFailure.test.ts`: 14 casos; categorias, operação, causa interna, nomes arbitrários, getters e ciclos.
- `speedTestRepository.test.ts`: operações R/W/D e contrato sanitizado.
- `useSpeedTest.test.tsx`: leitura/escrita com código, medição conservada e sucesso subsequente.
- `SpeedTestDialog.test.tsx`: código junto ao aviso sem perder métricas/controles.
- E2E `teste-conexao-tv`: quota simulada, código `NET-W-QUOTA`, anterior preservado, nenhum texto bruto visível.

## Local Verification

- `npx vitest run src/lib/network src/features/settings` → 166/166, 37 arquivos.
- `npm run lint` → exit 0, avisos anteriores; arquitetura aprovada.
- `npx tsc -b` → exit 0.
- `node e2e/run.mjs --only teste-conexao-tv --jobs 1` → 1/1 em 26,2 s.
- Travas 062 e 064 → íntegras, cinco casos cada.
- Contraprova pré-instrumentação no build de produção em Chromium novo → leitura/escrita aprovadas, sem reprodução do sintoma da TV.

## Deviations from Assessment

Nenhuma mudança fora do contrato. Dois ajustes nos testes: estabilizado o gate injetado no renderHook; cenário de quota movido após os checks existentes de rolagem porque o aviso cresce o card e altera sua altura. Nenhuma mudança de código para esconder esses efeitos.

## Follow-ups

- Obter código observado no diálogo da TV. Não adivinhar quota, corrupção de esquema ou motivo da falha.
- Corrigir a causa com evidência e rerrodar medição → fechar diálogo → reabrir/reiniciar app no aparelho.
- Ponto de commit possível da instrumentação: `fix(network): identificar falha ao guardar teste de conexão`; nenhum commit executado.
