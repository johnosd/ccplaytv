# Handoff — 061-classificacao-nota-tmdb

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend único em `tv-web/` (React 19 + TS + Vite, Dexie,
  react-query); `api/` congelado, não tocar.
- Próximo comando: `/sdd-execute 061-classificacao-nota-tmdb`. Status no backlog: `Planejada` (0/44).
- Fora desta sessão: nada. Nesta sessão o `sdd-plan` **corrigiu a spec** (FR-014, US1/AC6, Escopo, SC-001, SC-005 e
  uma Clarification nova): o cache do TMDB dura 6 meses, não 24 h, e o usuário escolheu reconsultar UMA vez ao abrir.

## O que a feature entrega

- **P1** — hero do detalhe de filme e de série: classificação indicativa do país do idioma + "TMDB 7,8" ao lado de
  "★ 7,4 Provedor".
- **P2** — billboard do Início: os mesmos dois.
- **P3** — card expandido do Início: os dois só com dado já no aparelho; Top 10/Dica trazem a nota da descoberta.
- Decisões do usuário que fogem do óbvio: país **pelo idioma** (pt → BR, en → US, es → ES), **nunca** país de reserva;
  pôsteres pequenos **não** mudam; registro antigo é reconsultado **uma vez** ao abrir (não espera os 6 meses).

## Leitura obrigatória, em ordem

1. `spec.md` — FRs/SCs; Clarifications no fim (inclui a correção do cache).
2. `plan.md` — D-001…D-010, Riscos R-001…R-006, comandos e travas.
3. `tasks.md` — 6 fases, contratos por fase.
4. `logic/classificacao-e-nota.md` — **a fonte das regras**: tabela de valores válidos por país (§2), ordem de tipo de
   lançamento, textos acessíveis e tokens (§3), `tmdbLacks061` (§5), onde cada tela lê (§6), notas da descoberta (§7).
5. `quickstart.md` — cenários 1–10 no navegador.
6. `.planning/memory/constitution.md` — "Foco… sem consulta ao focar", "IA e Classificação Nunca Inventam Dados".

## Testes de contrato

- `tv-web/src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts` — 2 testes (Fase 2)
- `tv-web/src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx` — 1 teste (Fase 2)
- `tv-web/src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts` — 1 teste (Fase 2)
- `tv-web/src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx` — 1 teste (Fase 3)
- Rodar (de `tv-web/`): `npx vitest run src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx`
- Trava (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 061-classificacao-nota-tmdb`
- Travas de **outras** features que esta pode quebrar: 055 (`RatingBadge` — não mexa nele), 035/033/032 (chamada de
  detalhe do TMDB), 059 (hero do detalhe), 060/026 (Início), 057 (descoberta).

## Stubs criados

- `tv-web/src/lib/metadata/contentRating.ts` — `CERTIFICATION_COUNTRY` e `TMDB_MIN_VOTES = 50` prontos; 4 funções com
  `not implemented`.
- `tv-web/src/components/ContentRatingBadge.tsx` e `TmdbRatingBadge.tsx` — `not implemented`.
- Já definitivos (não são stub): tipos `CertificationCountry`, `Certifications`, `TmdbRating` e os campos
  `TitleFields.certifications`/`tmdbRating` em `tv-web/src/lib/catalog/db.ts`; `TitleMetadataView.certifications`/
  `tmdbRating` em `tv-web/src/lib/metadata/types.ts`.

## Armadilhas já mapeadas

- `certifications` precisa ser gravado **sempre** (`{}` se vazio): é a presença da chave que impede reconsultar de novo
  (o contrato reabre e exige 0 requisições). Não "limpe" objeto vazio.
- Contratos esperam textos exatos: aria pt `Classificação indicativa: 14 anos`, en `Content rating: R`; o `textContent`
  da linha de metadata precisa conter `TMDB 7,8` contínuo (palavra, espaço, número com vírgula em pt).
- Ordem na linha de metadata: `★ Provedor` → classificação → `TMDB` (o contrato do hero compara posições no texto).
- Não reaproveitar o `RatingBadge` da 055 para a nota TMDB: o contrato travado dele proíbe o texto "TMDB".
- Sem bump do Dexie (campos dentro de `tmdb.fields`); a v17 continua livre.
- Card expandido: só `useCachedTitleView` e a nota da descoberta — **nunca** `useTitleMetadata` (consultaria ao focar).
- `DiscoveryRowResult.ratings` opcional, como `images` (mocks antigos não o devolvem — R-006).
- `HomeContent.tsx` já tem 864 linhas: lógica nova fora dele (R-005).
- Testes NÃO travados que semeiam `matched` sem `certifications` vão passar a ver 1 requisição (R-003): ajustar a
  semente, nunca o código para "não reconsultar".
- A 054 já relê o TMDB ao abrir em outro idioma; isso não é regressão (R-002).
- E2E: TMDB sempre simulado por `context.route` (padrão de `e2e/home-vitrine-expandida.mjs`); registrar na `SUITE` de
  `e2e/run.mjs`.

## Pendências do Analyze

- A1 (MEDIUM) — SC-006 sem medição na lista real: no T033, abrir ~10 títulos reais e registrar a contagem no `plan.md`.
- A2 (LOW) — FR-015 sem teste próprio: acrescentar no T011 um caso `no_match` sem os campos.
- A3 (LOW) — textos acessíveis en/es decididos no plano (en travado; es livre) — revisar no Polish se preciso.

## Gate de pronto

- 5/5 contratos verdes; travas 061, 055, 035, 033, 032, 059, 060, 057 íntegras.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`, `node e2e/run.mjs` (com
  `npm run dev`) — inclusive o novo `classificacao-nota-tmdb`.
- `quickstart.md` (cenários 1–10) no navegador.
- Docs no Polish: Spec V14 (Home e Detalhe deixam de tratar como "dado novo"), README, `plan.md`; não editar `CLAUDE.md`.
- TV física: **recomendação**, não gate.
