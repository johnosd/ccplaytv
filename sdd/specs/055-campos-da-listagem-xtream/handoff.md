# Handoff — feature 055 (nota, gênero e fundo vindos da listagem Xtream)

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Stack: React 19 + TypeScript + Vite (`tv-web/`), Dexie/IndexedDB, Vitest, Playwright. Único projeto tocado: `tv-web/`.
- Próximo comando: `/sdd-execute 055-campos-da-listagem-xtream`. Backlog: **Planejada** (0/38 itens).
- Arquivos que mudaram em disco fora desta sessão e devem ser relidos antes de editar: `.planning/backlog.md`, `sdd/specs/055-campos-da-listagem-xtream/spec.md` (mudou depois do plan começar; conferido, FR/SC consistentes com o plano). O working tree tem muita mudança de outras features (branch `feature/designWave2`) — **não** reverter nada que não seja desta feature.
- Origem: `sdd/assessments/aproveitar-campos-lista-xtream-hoje-descartados/` (veredito go). Conta de painel e `.env` com `CCPLAY_PROBE_*` ficam fora de qualquer texto: nunca citar valores.

## O que a feature entrega

- **US1 (P1)**: selo `★ 7,4` nos cards de Filmes/Séries (grade e fileiras `portrait`) e `★ 7,4 Provedor` no destaque e no detalhe. Nota 0/ausente/inválida **não mostra nada** (nem "0", nem "sem nota").
- **US2 (P2)**: no destaque de **série**, gênero como subtítulo e fundo da listagem (`provider_backdrop_url ?? icon_url`). Filme continua com `icon_url`, sem gênero.
- **US3 (P3)**: lista antiga funciona como antes e ganha os campos no refresh normal (24 h) — **sem** migração, sem reimportação, sem tocar `freshness.ts`.
- Decisões do usuário que contrariam o óbvio: **o `year` ficou fora** (a Explora mostrou que quase não rende); **o detalhe não muda** para gênero/fundo (o que ele obtém já prevalece); o card `wide` do "Continue assistindo", Início, Busca e Favoritos **não** ganham selo.

## Leitura obrigatória, em ordem

1. `spec.md` — o quê (FR-001…FR-016, SC-001…SC-006, Clarifications).
2. `plan.md` — Decisões Invariantes D-001…D-010, Constitution Check, riscos R-001…R-008, tabela de contratos.
3. `logic/campos-da-listagem.md` — **leia inteiro**: regras de normalização, "chave só quando existe", a armadilha da assinatura do bloco (§4), posição do selo e onde NÃO mostrar (§5).
4. `tasks.md` — T001…T028 por fase; Fase 2 bloqueia o resto.
5. `quickstart.md` — checagens, cenário ponta a ponta e medições SC-003/SC-004.
6. `.planning/memory/constitution.md` — foco, segredos, "IA e Classificação Nunca Inventam Dados", categorias da fonte.

## Testes de contrato (5, travados)

- `tv-web/src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts` — 3 testes, **Fase 2**.
- `tv-web/src/components/RatingBadge.campos-da-listagem.contract.test.tsx` — 2 testes, **Fase 3**.
- Rodar: `npx vitest run src/lib/catalog/vodMetadata.campos-da-listagem.contract.test.ts src/components/RatingBadge.campos-da-listagem.contract.test.tsx` (em `tv-web/`).
- Integridade (raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 055-campos-da-listagem-xtream`. **Nunca editar** os arquivos nem o `.lock`; o script recusa `.skip/.only/.todo/.each`.
- Estado hoje: os 5 estão **vermelhos** (asserção ou `Error: not implemented`), `tsc -b` limpo, e 842 testes de `src/lib/catalog`+`src/components` verdes além deles.
- Travas de outras features que esta pode quebrar: `itemsSignature` e `mapVodEntry/mapSeriesEntry` têm contratos das features 025, 039 e 044 (`categoryBlocks.catalogo-em-blocos.contract.test.ts`, `vodMetadata.filmes-series-ds-v14.contract.test.ts`, `importPipeline.parser-m3u-headers.contract.test.ts`). Rode-os depois de T003/T005.

## Stubs criados

- `tv-web/src/lib/catalog/classifier.ts` → `normalizeProviderRating`, `normalizeProviderGenres`, `firstBackdropUrl` com `throw new Error('not implemented')` — substituir pela implementação (T002).
- `tv-web/src/components/RatingBadge.tsx` → componente com `throw new Error('not implemented')` (T011).
- **Definitivos** (só tipos, não são provisórios): `providerRating`/`providerGenres`/`providerBackdropUrl` em `CatalogRecord` (`db.ts`) e em `ClassifiedEntry` (`classifier.ts`).
- **Ainda não existem** e fazem parte das tasks: campos `provider_*` em `CatalogItemOut` (T006), a chave i18n `rating.provider` (T010), o CSS do selo (T012) e o E2E (T024).

## Armadilhas já mapeadas

- **Assinatura do bloco** (`categoryBlocks.ts`, `itemsSignature`): se os campos novos não entrarem nela, `writeBlockWithin` considera o bloco igual e **nunca grava a nota em lista existente**. Entram **só quando existem** e **depois** dos campos da 044, nessa ordem (D-005, R-001). O contrato trava isso.
- **Chave só quando existe**: não escrever `providerRating: undefined` em `mapVodEntry/mapSeriesEntry/toItemRecord/toStoredRecord` — o clone estruturado guarda a chave vazia e 43 mil itens engordam (contrato `'providerRating' in item === false`).
- **Dois gravadores copiam campo a campo**: `categoryLoader.toItemRecord` e `importPipeline.toStoredRecord`. Esqueça um e a nota some em metade das fontes (M3U-painel usa o caminho de seção). `toBlockItem` já espalha o registro; não mexer.
- **Só um construtor de `CatalogItemOut`**: `catalogApi.ts` `itemOut()` (verificado por busca de `added_at:`). Tudo passa por ali; telas nunca leem `db.channels` direto.
- **Vírgula decimal é inválida** (o painel real manda `9.2`); `10.01` é rejeitado **antes** de arredondar para `10`; `rating_5based` nunca é lido.
- **Gênero e fundo só em série**; o contrato afirma que `mapVodEntry` ignora `genre`/`backdrop_path`.
- **Selo não focável** (sem `tabindex`/`button`) e em canto próprio: `.fav-star` é superior direito, `.watched-badge` inferior esquerdo (`styles/shared.css:365-376`) ⇒ nota no superior esquerdo. Só tokens `var(--…)`.
- **`wide` do "Continue assistindo"** usa backdrop em cache: não pôr selo ali.
- **Hero é `aria-hidden`**; `VodHeroArt` só recebe a URL. Fundo 16:9 pode recortar mal: ver `vod.css:242` (R-006).
- **Sem bump do Dexie, sem arquivo emitido novo**: nada a listar em `tizen_web_project.yaml`; `npm run build:tizen` confirma.
- **E2E**: rode `npm run dev` antes; `run.mjs` executa em paralelo (use `--only campos-da-listagem,...`); scripts `*-real.mjs` ficam fora da suíte (precisam do `.env`). Modelo de painel falso: `e2e/carga-listas.mjs`, `e2e/capa-real.mjs`. Registrar o novo roteiro em `SUITE` de `e2e/run.mjs`.
- **Medições SC-003/SC-004** exigem uma linha de base antes de mexer (ver achado A-02 abaixo).

## Pendências do Analyze

- **A-01 MEDIUM** — SC-001/FR-005 dizem "no card", mas D-009 limita o selo à grade e às fileiras `portrait` de Filmes/Séries (fora: `wide`, Início, Busca, Favoritos). Recomendação: estreitar o texto de SC-001/FR-005 para "cards da grade e das fileiras de Filmes e Séries" no `sdd-converge`, ou ampliar o escopo conscientemente.
- **A-02 MEDIUM** — a linha de base de SC-003/SC-004 (tamanho do IndexedDB e tempo de importação) precisa ser medida **antes** da Fase 2; T001 só registra a contagem de testes. Recomendação: no T001, medir `storage.estimate()` e os tempos com a lista real e guardar em `Execution Notes`.
- **A-03 LOW** — FR-015 (sem URL/credencial em log) só tem verificação manual (T026); nenhum teste a cobre. Recomendação: se algum `console.*` ou mensagem de erro for tocado, adicionar uma asserção; caso contrário, manter a revisão manual.
- **A-04 LOW** — "destaque" no texto da spec refere-se ao hero da vitrine de Filmes/Séries (`VodShowcaseScreen`), não ao hero do Início (`homeHero.ts`). Recomendação: explicitar no converge.
- **A-05 LOW** — o contador do backlog soma os itens do Checklist de Release (38 itens); não é o número de tasks (28). Sem ação.

## Gate de pronto

1. 5 contratos verdes + `check-contract-tests.ps1` íntegro (e os contratos das features 025/039/044 acima ainda verdes).
2. Em `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test` verdes (nenhum teste antigo editado para passar).
3. `npm run test:e2e` (com `npm run dev`) verde, incluindo o novo `campos-da-listagem` — **gate antes de qualquer passada na TV** (constituição).
4. Medições SC-003 (< 1,5 MB) e SC-004 (< 10%) registradas sem valores secretos.
5. `quickstart.md` executado no navegador; revisão de segredos.
6. `npm run build:tizen` sem arquivo novo a listar.
7. Docs no Polish: marcar o item 68 do backlog (a nota do provedor já existe no registro) — **só** `## Ideias Futuras`, a mão; as colunas de status são dos scripts. **Não** acrescentar parágrafo de status em `CLAUDE.md`.
8. Passada na TV física: recomendada (legibilidade dos três selos a 1920×1080, fundo 16:9 no hero, importação grande sem travar), não bloqueante.
