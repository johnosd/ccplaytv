# Bug Fix: Prefetch de categoria sem cancelamento de requisição HTTP em voo

- **Slug**: prefetch-concorrente-categoria-sem-cancelamento-requisicao
- **Corrigido**: 2026-09-25
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`useCategoryFocusPrefetch` agora carrega um `AbortController` por busca de
prefetch e aborta o anterior sempre que o foco muda para outra categoria
antes dele completar — exceto quando essa categoria anterior é a que a
pessoa já **entrou** de fato (`enteredCategoryId`), já que essa busca pode
estar compartilhada com a entrada real via `dedup` do `categoryLoader`. O
`AbortSignal` foi propagado por toda a cadeia (`prefetchCategoryContent` →
`loadCategoryContent`/`ensureCategory` → `fetchAndStore`/`fetchMappedItems`
→ `fetchLiveStreams`/`fetchVodStreams`/`fetchSeries` →
`fetchJsonDirect`'s `fetch(url, { signal })`), e um cancelamento
(`AbortError`) é tratado como decisão deliberada — nunca dispara
`probeFailureKind` (evitaria uma segunda requisição à toa) nem marca a
categoria como `failed`/`stale-served` (evitaria sobrescrever um conteúdo
bom já servido, ou marcar a categoria como quebrada por engano).

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `tv-web/src/features/catalog/catalogApi.ts` | modified | `loadCategoryContent`/`prefetchCategoryContent` ganham `signal?` opcional; `useCategoryFocusPrefetch` ganha `inFlightRef` (categoria + `AbortController`) e aborta o anterior ao iniciar um novo prefetch, com a exceção de `enteredCategoryId` |
| `tv-web/src/lib/catalog/categoryLoader.ts` | modified | `EnsureCategoryOptions.signal?`; `fetchMappedItems`/`fetchAndStore` repassam o sinal; `AbortError` (via `isAbortError`) propaga em vez de virar `failed`/`stale-served` |
| `tv-web/src/lib/catalog/xtreamConnector.ts` | modified | `isAbortError` exportado; `fetchJsonDirect`/`fetchListDirect`/`fetchLiveStreams`/`fetchVodStreams`/`fetchSeries` aceitam `signal?` e o repassam ao `fetch` nativo; `AbortError` não dispara `probeFailureKind` |
| `tv-web/src/features/catalog/catalogApi.test.tsx` | modified | testes existentes ajustados para a assinatura nova (`{ signal }` como 3º argumento de `ensureCategory`); 4 testes novos (ver abaixo) |

## Tests Added or Updated

- `catalogApi.test.tsx::"entrar na categoria focada cancela um timer de prefetch já agendado"` — travava o comportamento já existente (cancelamento do *timer*, não da requisição), continua passando.
- `catalogApi.test.tsx::"focar uma segunda categoria aborta o prefetch em voo da primeira"` (novo) — foca categoria 1 (dispara prefetch real), foca categoria 2 antes da primeira resolver, confirma que o `AbortSignal` da primeira foi de fato acionado (`.aborted === true`) e que só 2 chamadas a `ensureCategory` ocorreram (uma por categoria, nunca reacionada).
- `catalogApi.test.tsx::"entrar de fato numa categoria nunca é abortada por um prefetch de outra"` (novo) — foca categoria 1, prefetch dispara, a pessoa ENTRA de fato na categoria 1 (`enteredId=1`) e o cursor segue para a categoria 2; confirma que o sinal da categoria 1 (a entrada real, compartilhada via dedup) continua `.aborted === false`.
- `catalogApi.test.tsx::"categoria já entrada nunca prefetcha..."` e `"...cancela um timer já agendado"` — cobertura pré-existente (feature 015, R-005) mantida sem alteração de comportamento.
- Asserções de `toHaveBeenCalledWith` existentes atualizadas para incluir o terceiro argumento `{ signal: expect.any(AbortSignal) }`.

## Local Verification

- `npm run test -- --run src/features/catalog/catalogApi.test.tsx` → 30/30 passando.
- `npm run test -- --run` (suite completa) → 680/681 passando; 1 falha em `LiveScreen.favorites.test.tsx:279` (arquivo **não tocado** por este fix) — confirmada como flakiness pré-existente de timing sob carga paralela pesada, já documentada nesta mesma sessão de trabalho antes deste bugfix: `npm run test -- --run src/features/live/LiveScreen.favorites.test.tsx` isolado → 13/13 passando.
- `npm run lint` → limpo (só os warnings pré-existentes já catalogados no projeto, nenhum novo).
- `npm run build` (`tsc -b && vite build`) → limpo.
- Checagem manual: revisão linha a linha dos 3 diffs de produção contra `assessment.md` antes de rodar qualquer teste — a lógica de exceção para `enteredCategoryId` foi conferida contra o `dedup`/`inFlight` de `categoryLoader.ts` para confirmar que abortar um prefetch nunca derruba uma entrada real que esteja compartilhando a mesma busca.

## Deviations from Assessment

O assessment (Risks & Considerations) levantou a possibilidade de usar o
`signal` nativo que `queryClient.prefetchQuery` do React Query v5 já
propaga para a `queryFn` quando a query é cancelada, em vez de gerenciar um
`AbortController` manual. **Não foi esse o caminho usado** — o cancelamento
aqui precisa acontecer no instante em que o **foco muda para outra
categoria**, o que já era tratado fora do React Query (o `useEffect` do
`useCategoryFocusPrefetch`, via `setTimeout`/`clearTimeout`); o signal
nativo do React Query só existiria depois que a `queryFn` já tivesse sido
chamada, e cobre cancelamento por desmontagem/nova chamada da MESMA
`queryKey` — não o caso de "o cursor saiu antes do debounce dessa
categoria específica sequer disparar de novo para outra". Gerenciar o
`AbortController` manualmente, ao lado do `setTimeout` já existente,
manteve toda a lógica de "quando cancelar o quê" num único lugar
(`inFlightRef`), sem duplicar mecanismo. Considerado equivalente em efeito
prático à alternativa nativa, mais direto de auditar.

## Follow-ups

- **Verificação pendente na TV física**: esta correção não pôde ser
  recronometrada contra a mesma fonte real/rede real que originou o
  relato (>1 minuto na categoria "Telecine", 14 canais) — só verificada
  por teste automatizado + leitura de código. Recomendado reabrir a
  sessão de validação com o usuário na TV para confirmar a melhora
  percebida antes de considerar o bug fechado de ponta a ponta.
- Nenhum follow-up de código identificado além do já coberto.
