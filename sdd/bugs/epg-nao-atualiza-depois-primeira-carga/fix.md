# Bug Fix: EPG não atualiza depois da primeira carga

- **Slug**: epg-nao-atualiza-depois-primeira-carga
- **Corrigido**: 2026-10-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Abrir a lista (ou voltar o app ao primeiro plano, que passa pelo mesmo
`useOpenSource`) agora pede o EPG vencido (> 12 h) em segundo plano **sempre**,
em paralelo à importação, em vez de só quando não havia importação a fazer. O
gatilho pós-importação deixou de baixar o XMLTV toda vez: só pede quando a
importação trocou o endereço do EPG ou quando o EPG continua vencido sem
nenhuma tentativa desde o início da importação.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/import/importApi.ts` | modified | `useOpenSource`: `isEpgStale → requestEpgSync` antes de decidir a importação. `startLocalImport`: lê a fonte antes de importar e, ao concluir, usa `isEpgDueAfterImport` em vez de "concluída = sincroniza". Arquivo foi de 578 para 571 linhas (teto do ratchet: 578). |
| `tv-web/src/lib/epg/epgStatus.ts` | modified | Nova função pura `isEpgDueAfterImport(before, after, importStartedAt, now)`: endereço resolvido mudou → sim; senão, só com EPG vencido e sem sucesso/falha registrados depois de `importStartedAt`. |

## Tests Added or Updated

- `tv-web/src/features/import/importApi.epg.test.tsx::abrir com importação devida e EPG vencido pede o EPG já, qualquer que seja o desfecho da importação` — `failed`, `cancelled` e importação que nunca termina: o EPG é pedido exatamente uma vez. **Falha no código antigo** (conferido revertendo `importApi.ts`).
- `tv-web/src/features/import/importApi.epg.test.tsx::importação concluída depois de o EPG já ter sincronizado (na abertura) não baixa de novo` — sem download em dobro. **Falha no código antigo.**
- `importApi.epg.test.tsx`: `handleWith` passou a carregar `startedAt`; comentário de cabeçalho atualizado. Os 5 casos anteriores seguem iguais e passando.
- `tv-web/src/lib/epg/epgStatus.test.ts::isEpgDueAfterImport …` — 4 casos: vencido sem tentativa; em dia ou já tentado (sucesso ou falha) durante a importação; `url-tvg` trocado (inclusive sem retrato anterior); sem endereço / desativado.

## Local Verification

- `npx vitest run src/features/import/importApi.epg.test.tsx src/lib/epg/` → 14 arquivos, 78/78 testes.
- Os mesmos testes com o `importApi.ts` de `HEAD` → os 2 novos falham (5 passam); restaurado o corrigido.
- `npm run lint` → ok (oxlint + architecture: "ok — 372 arquivos de produção…", só avisos antigos de exceções obsoletas).
- `npx tsc -b` → 3 erros, **todos em `src/lib/catalog/categoryAccess.leitores.test.ts`** (feature 066 em andamento, não versionada), nenhum nos arquivos deste fix.
- `npx vitest run src/features/import src/lib/epg src/features/settings src/App` → 283/286. As 3 falhas são em `App.source-access.test.tsx` e **já existiam**: com o `importApi.ts` de `HEAD`, o mesmo lote dá as mesmas 3 falhas (mais as 2 dos testes novos). Isolado, `App.source-access.test.tsx` passa 5/5 com o código antigo e com o novo — falha de lote/ambiente, não deste fix.
- Checagens manuais: nenhuma; a TV física não foi tocada nesta fase.

## Deviations from Assessment

- O critério pós-importação ficou um pouco mais restrito do que "vencido ou endereço mudou": além de vencido, exige que **nenhuma tentativa** (sucesso ou falha) tenha acontecido depois de a importação começar. Sem isso, uma sincronização da abertura que falhou durante a importação seria repetida logo em seguida (15 MB em dobro). Mesmo arquivo previsto, sem expansão de escopo.
- Consequência assumida: "Ressincronizar" a lista em Configurações com o EPG em dia e o mesmo endereço **não** baixa mais o EPG junto (antes baixava a cada importação concluída). O EPG continua tendo a ação própria de sincronizar (`useSyncEpg`).

## Follow-ups

- Fase Test na TV física: conferir em Configurações › Fontes IPTV se o EPG mostrava "vinculado" com data antiga ou erro `EPG-02` antes do fix (pergunta aberta do assessment), e se, abrindo a lista com EPG > 12 h, a data da última sincronização avança — e a abertura não fica pesada com EPG e importação rodando juntos.
- Sondas futuras do painel real precisam de User-Agent de TV (o `curl` padrão recebe 403).
- Fora do escopo: as 3 falhas de lote em `App.source-access.test.tsx` e os erros de tipo da 066.
